import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { HttpError, type Child } from "./access";
import { audit } from "./audit";
import type { DB } from "./db";
import { schema } from "./db";
import { env } from "./env";
import { enqueue } from "./jobs/queue";
import { compileSkillMarkdown, validateSkill } from "@/cinema/skill";
import { findPipeline, findProfile, suggestPipeline } from "@/studio/catalog";
import { buildProposal, buildScenes, runtimeFor, type PlannedAsset } from "@/studio/plan";

const RUNNING = new Set(["ASSET_PREPARATION", "TIMELINE", "RENDERING", "AUDIO_MIX", "QUALITY_REVIEW", "UPLOADING"]);

function assertPublicHttps(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new HttpError(400, "bad_reference", "Reference link is not a valid URL.");
  }
  const host = url.hostname.toLowerCase();
  if (url.protocol !== "https:" || host === "localhost" || host.endsWith(".local") || host.endsWith(".internal") || /^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    throw new HttpError(400, "bad_reference", "Reference links must be a public https address. The file is not downloaded.");
  }
  return url.toString();
}

async function eligibleMedia(db: DB, childId: string, input: { mediaIds?: string[]; albumId?: string; allReady?: boolean }) {
  const conds = [eq(schema.media.childId, childId), isNull(schema.media.deletedAt), inArray(schema.media.kind, ["image", "video"] as const)];
  if (input.albumId) {
    conds.push(sql`${schema.media.id} in (select media_id from album_media where album_id = ${input.albumId})`);
  }
  if (input.mediaIds?.length && !input.allReady) conds.push(inArray(schema.media.id, input.mediaIds));
  const rows = await db
    .select()
    .from(schema.media)
    .where(and(...conds))
    .orderBy(sql`${schema.media.capturedAt} asc nulls last`, asc(schema.media.createdAt));
  return rows.filter((row) => row.status !== "duplicate" && row.status !== "failed");
}

export async function createStudioProject(
  db: DB,
  child: Child,
  userId: string,
  input: {
    title: string;
    prompt: string;
    pipeline?: string;
    profile: string;
    mediaIds?: string[];
    albumId?: string;
    allReady?: boolean;
    acknowledgeLarge?: boolean;
    musicMediaId?: string;
    referenceUrl?: string;
  },
) {
  const pipelineName = input.pipeline || suggestPipeline(input.prompt);
  const pipeline = findPipeline(pipelineName);
  if (!pipeline || pipeline.internal) throw new HttpError(400, "unknown_pipeline", "That pipeline is not in the pinned OpenMontage catalog.");
  if (!pipeline.sourceLed) {
    throw new HttpError(
      400,
      "provider_required",
      "That pipeline needs generated or stock media. This studio does not call a paid or stock provider, so the pipeline stays unavailable.",
    );
  }
  const profile = findProfile(input.profile);
  if (!profile) throw new HttpError(400, "unknown_profile", "That output profile is not in the pinned OpenMontage media profiles.");
  const referenceUrl = input.referenceUrl ? assertPublicHttps(input.referenceUrl) : null;
  if (!input.allReady && !input.albumId && !input.mediaIds?.length) {
    throw new HttpError(400, "no_media", "Select media, an album, or all ready items.");
  }
  const rows = await eligibleMedia(db, child.id, input);
  if (!rows.length) throw new HttpError(400, "no_media", "No eligible photographs or videos were found.");
  const cap = env().STUDIO_ASSET_CAP;
  if (rows.length > cap) {
    throw new HttpError(422, "too_many_assets", `${rows.length} items exceed the cap of ${cap}. Narrow the selection. Nothing was dropped.`);
  }
  const estimated = rows.reduce((sum, row) => sum + (row.kind === "video" ? Math.min((row.durationMs ?? 8000) / 1000, 8) : 4), 6);
  if (rows.length > 80 && !input.acknowledgeLarge) {
    throw new HttpError(409, "large_collection", `${rows.length} items, about ${Math.round(estimated)} seconds. Confirm to keep every item.`);
  }
  if (input.musicMediaId) {
    const music = await db.select().from(schema.media).where(and(eq(schema.media.id, input.musicMediaId), eq(schema.media.childId, child.id), isNull(schema.media.deletedAt))).limit(1);
    if (!music[0] || music[0].kind !== "audio") throw new HttpError(400, "bad_audio", "The soundtrack must be an audio file already in the library.");
  }
  const planned: PlannedAsset[] = rows.map((row, index) => ({
    id: `${index + 1}`,
    mediaId: row.id,
    kind: row.kind as PlannedAsset["kind"],
    caption: row.caption,
    durationSeconds: row.kind === "video" ? Math.min(Math.max((row.durationMs ?? 4000) / 1000, 1), 8) : row.favorite ? 6 : 4,
    hero: row.favorite,
    dateNeedsReview: row.dateNeedsReview,
    position: index,
  }));
  const runtime = runtimeFor(planned);
  const scenes = buildScenes(planned, input.title);
  const proposal = buildProposal({
    title: input.title,
    prompt: input.prompt,
    pipeline: pipeline.name,
    profile: profile.name,
    renderRuntime: runtime.renderRuntime,
    rendererFamily: runtime.rendererFamily,
    assetCount: planned.length,
    undated: planned.filter((asset) => asset.dateNeedsReview).length,
    durationSeconds: scenes.at(-1)?.end_seconds ?? 0,
    referenceUrl,
  });
  const [project] = await db
    .insert(schema.studioProjects)
    .values({
      childId: child.id,
      title: input.title,
      prompt: input.prompt,
      pipeline: pipeline.name,
      profile: profile.name,
      stage: "AWAITING_APPROVAL",
      renderRuntime: runtime.renderRuntime,
      rendererFamily: runtime.rendererFamily,
      externalProcessing: false,
      referenceUrl,
      musicMediaId: input.musicMediaId ?? null,
    })
    .returning();
  await db.insert(schema.studioProjectAssets).values(
    planned.map((asset) => ({
      projectId: project.id,
      mediaId: asset.mediaId,
      position: asset.position,
      caption: asset.caption,
      durationSeconds: asset.durationSeconds,
      hero: asset.hero,
    })),
  );
  await db.insert(schema.studioProductionBriefs).values({ projectId: project.id, proposal });
  await db.insert(schema.studioScenePlans).values({ projectId: project.id, plan: { version: "1.0", scenes } });
  await db.insert(schema.studioDecisionLogs).values({
    projectId: project.id,
    category: "proposal",
    summary: `Source-led ${pipeline.name} on ${profile.name}. Research and paid generation were not run.`,
  });
  await db.insert(schema.studioCostRecords).values({
    projectId: project.id,
    provider: "local",
    amountUsd: 0,
    note: "No provider call.",
  });
  if (input.musicMediaId) {
    await db.insert(schema.studioAudioAssets).values({ projectId: project.id, mediaId: input.musicMediaId, role: "soundtrack" });
  }
  await audit(userId, "studio.project.create", "studio_project", project.id, { pipeline: pipeline.name, assets: planned.length });
  return project;
}

export async function getStudioProject(db: DB, childId: string, id: string) {
  const [project] = await db.select().from(schema.studioProjects).where(and(eq(schema.studioProjects.id, id), eq(schema.studioProjects.childId, childId))).limit(1);
  if (!project) throw new HttpError(404, "not_found", "Production not found.");
  const assets = await db.select().from(schema.studioProjectAssets).where(eq(schema.studioProjectAssets.projectId, id)).orderBy(asc(schema.studioProjectAssets.position));
  const [plan] = await db.select().from(schema.studioScenePlans).where(eq(schema.studioScenePlans.projectId, id)).orderBy(desc(schema.studioScenePlans.createdAt)).limit(1);
  const [brief] = await db.select().from(schema.studioProductionBriefs).where(eq(schema.studioProductionBriefs.projectId, id)).orderBy(desc(schema.studioProductionBriefs.createdAt)).limit(1);
  const exports_ = await db.select().from(schema.studioExports).where(eq(schema.studioExports.projectId, id)).orderBy(desc(schema.studioExports.createdAt));
  const decisions = await db.select().from(schema.studioDecisionLogs).where(eq(schema.studioDecisionLogs.projectId, id)).orderBy(asc(schema.studioDecisionLogs.createdAt));
  const mediaIds = assets.map((asset) => asset.mediaId);
  const mediaRows = mediaIds.length
    ? await db.select().from(schema.media).where(and(eq(schema.media.childId, childId), inArray(schema.media.id, mediaIds)))
    : [];
  const kinds = new Map(mediaRows.map((row) => [row.id, row.kind]));
  const planned: PlannedAsset[] = assets.filter((asset) => !asset.omitted).map((asset) => ({
    id: asset.id,
    mediaId: asset.mediaId,
    kind: (kinds.get(asset.mediaId) as PlannedAsset["kind"]) ?? "image",
    caption: asset.caption,
    durationSeconds: asset.durationSeconds,
    hero: asset.hero,
    dateNeedsReview: false,
    position: asset.position,
  }));
  const audio = await db
    .select({ id: schema.media.id, filename: schema.media.filenameOriginal })
    .from(schema.media)
    .where(and(eq(schema.media.childId, childId), eq(schema.media.kind, "audio"), isNull(schema.media.deletedAt)))
    .limit(100);
  return {
    project,
    assets: assets.map((asset) => ({ ...asset, kind: kinds.get(asset.mediaId) ?? "image" })),
    plan: plan?.plan ?? null,
    timeline: buildScenes(planned, project.title),
    proposal: brief?.proposal ?? null,
    exports: exports_,
    decisions,
    audio,
  };
}

export async function setStudioMusic(db: DB, childId: string, id: string, musicMediaId: string | null) {
  const current = await getStudioProject(db, childId, id);
  if (RUNNING.has(current.project.stage)) throw new HttpError(409, "locked", "The soundtrack cannot change while a render is running.");
  if (musicMediaId) {
    const [music] = await db.select().from(schema.media).where(and(eq(schema.media.id, musicMediaId), eq(schema.media.childId, childId), isNull(schema.media.deletedAt))).limit(1);
    if (!music || music.kind !== "audio") throw new HttpError(400, "bad_audio", "Choose an audio file already in the library.");
  }
  await db.update(schema.studioProjects).set({ musicMediaId, updatedAt: new Date() }).where(eq(schema.studioProjects.id, id));
  await db.delete(schema.studioAudioAssets).where(eq(schema.studioAudioAssets.projectId, id));
  if (musicMediaId) await db.insert(schema.studioAudioAssets).values({ projectId: id, mediaId: musicMediaId, role: "soundtrack" });
  await db.insert(schema.studioDecisionLogs).values({
    projectId: id,
    category: "audio",
    summary: musicMediaId ? "A library soundtrack will be mixed into the film." : "No soundtrack. The film is intentionally silent.",
  });
  return getStudioProject(db, childId, id);
}

export async function updateStudioScenes(
  db: DB,
  childId: string,
  id: string,
  edits: { id: string; caption?: string; durationSeconds?: number; omitted?: boolean; hero?: boolean; position?: number }[],
) {
  const current = await getStudioProject(db, childId, id);
  if (RUNNING.has(current.project.stage) || current.project.stage === "COMPLETED") {
    throw new HttpError(409, "locked", "The scene plan is locked while a render is running.");
  }
  for (const edit of edits) {
    const row = current.assets.find((asset) => asset.id === edit.id);
    if (!row) continue;
    await db
      .update(schema.studioProjectAssets)
      .set({
        caption: edit.caption === undefined ? row.caption : edit.caption.slice(0, 500),
        durationSeconds: edit.durationSeconds === undefined ? row.durationSeconds : Math.min(Math.max(edit.durationSeconds, 1), 30),
        omitted: edit.omitted ?? row.omitted,
        hero: edit.hero ?? row.hero,
        position: edit.position ?? row.position,
      })
      .where(eq(schema.studioProjectAssets.id, row.id));
  }
  const assets = await db.select().from(schema.studioProjectAssets).where(eq(schema.studioProjectAssets.projectId, id)).orderBy(asc(schema.studioProjectAssets.position));
  const planned: PlannedAsset[] = assets
    .filter((asset) => !asset.omitted)
    .map((asset) => ({
      id: asset.id,
      mediaId: asset.mediaId,
      kind: "image",
      caption: asset.caption,
      durationSeconds: asset.durationSeconds,
      hero: asset.hero,
      dateNeedsReview: false,
      position: asset.position,
    }));
  const media = await db.select().from(schema.media).where(inArray(schema.media.id, assets.map((asset) => asset.mediaId)));
  const kinds = new Map(media.map((row) => [row.id, row.kind]));
  const dated = new Map(media.map((row) => [row.id, row.dateNeedsReview]));
  for (const asset of planned) {
    asset.kind = (kinds.get(asset.mediaId) as PlannedAsset["kind"]) ?? "image";
    asset.dateNeedsReview = dated.get(asset.mediaId) ?? false;
  }
  const scenes = buildScenes(planned, current.project.title);
  const runtime = runtimeFor(planned);
  await db.insert(schema.studioScenePlans).values({ projectId: id, plan: { version: "1.0", scenes } });
  await db.update(schema.studioProjects).set({ renderRuntime: runtime.renderRuntime, rendererFamily: runtime.rendererFamily, updatedAt: new Date() }).where(eq(schema.studioProjects.id, id));
  return getStudioProject(db, childId, id);
}

export async function approveStudioProject(db: DB, childId: string, userId: string, id: string) {
  const current = await getStudioProject(db, childId, id);
  if (current.project.stage !== "AWAITING_APPROVAL") throw new HttpError(409, "locked", "This production is not waiting for approval.");
  const active = current.assets.filter((asset) => !asset.omitted);
  if (active.length < 1) throw new HttpError(400, "no_media", "Every shot is omitted.");
  await db.insert(schema.studioApprovalGates).values({ projectId: id, stage: "proposal", decision: "approved" });
  await db.insert(schema.studioDecisionLogs).values({
    projectId: id,
    category: "approval",
    summary: `Approved ${current.project.renderRuntime} for ${active.length} shots.`,
  });
  await db.update(schema.studioProjects).set({ stage: "PLANNING", approvedAt: new Date(), updatedAt: new Date(), errorMessage: null }).where(eq(schema.studioProjects.id, id));
  await audit(userId, "studio.project.approve", "studio_project", id);
  return getStudioProject(db, childId, id);
}

export async function enqueueStudioRender(db: DB, childId: string, userId: string, id: string, profileName?: string) {
  const current = await getStudioProject(db, childId, id);
  if (!current.project.approvedAt || current.project.stage === "AWAITING_APPROVAL") {
    throw new HttpError(409, "not_approved", "Approve the scene plan before rendering.");
  }
  if (RUNNING.has(current.project.stage)) throw new HttpError(409, "busy", "A render is already running.");
  const profile = findProfile(profileName || current.project.profile);
  if (!profile) throw new HttpError(400, "unknown_profile", "That output profile is not in the pinned OpenMontage media profiles.");
  const [exp] = await db.insert(schema.studioExports).values({ projectId: id, profile: profile.name, status: "queued" }).returning();
  const job = await enqueue(db, "studio.render", { projectId: id, exportId: exp.id }, { idempotencyKey: `studio:${exp.id}`, maxAttempts: 2 });
  const [run] = await db.insert(schema.studioPipelineRuns).values({ projectId: id, exportId: exp.id, jobId: job.id, stage: "ASSET_PREPARATION" }).returning();
  await db.update(schema.studioProjects).set({ stage: "ASSET_PREPARATION", profile: profile.name, errorMessage: null, updatedAt: new Date() }).where(eq(schema.studioProjects.id, id));
  await audit(userId, "studio.render.enqueue", "studio_export", exp.id, { runId: run.id });
  return { exportId: exp.id, jobId: job.id };
}

export async function deleteStudioExport(db: DB, childId: string, projectId: string, exportId: string, remove: (key: string) => Promise<void>) {
  const current = await getStudioProject(db, childId, projectId);
  const exp = current.exports.find((row) => row.id === exportId);
  if (!exp) throw new HttpError(404, "not_found", "Export not found.");
  if (exp.storageKey) await remove(exp.storageKey);
  await db.delete(schema.studioExports).where(eq(schema.studioExports.id, exportId));
  return getStudioProject(db, childId, projectId);
}

export async function cancelStudioProject(db: DB, childId: string, id: string) {
  const current = await getStudioProject(db, childId, id);
  if (current.project.stage === "COMPLETED") throw new HttpError(409, "locked", "A finished export stays until you delete that export.");
  await db.update(schema.jobs).set({ cancelRequested: true }).where(and(eq(schema.jobs.jobType, "studio.render"), sql`${schema.jobs.payload}->>'projectId' = ${id}`, inArray(schema.jobs.status, ["queued", "processing"])));
  await db.update(schema.studioProjects).set({ stage: "CANCELLED", updatedAt: new Date() }).where(eq(schema.studioProjects.id, id));
  return getStudioProject(db, childId, id);
}

export async function saveStudioSkill(db: DB, childId: string, sourceName: string, raw: string, markdown: boolean) {
  const compiled = markdown ? compileSkillMarkdown(raw) : null;
  let candidate: unknown = compiled?.skill ?? null;
  if (!markdown) {
    try {
      candidate = JSON.parse(raw);
    } catch {
      throw new HttpError(400, "invalid_skill", "Skill file is not valid JSON.");
    }
  }
  const validated = validateSkill(candidate);
  if (!validated.ok) {
    const messages = [...(compiled?.errors ?? []), ...validated.errors].map((error) => error.message);
    throw new HttpError(400, "invalid_skill", messages.join(" ") || "The skill was rejected.");
  }
  const [skill] = await db.insert(schema.studioSkills).values({ childId, title: validated.skill.title, enabled: false }).returning();
  const [version] = await db
    .insert(schema.studioSkillVersions)
    .values({ skillId: skill.id, version: 1, status: "draft", manifest: validated.skill, sourceName })
    .returning();
  await db.update(schema.studioSkills).set({ activeVersionId: version.id }).where(eq(schema.studioSkills.id, skill.id));
  return { skill, version, notice: compiled?.notice || "Draft only. Approve it before use. Uploaded skills are data and are not executed." };
}
