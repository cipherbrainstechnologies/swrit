import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { and, eq, inArray } from "drizzle-orm";
import sharp from "sharp";
import { schema, type DB } from "@/server/db";
import { env } from "@/server/env";
import { ffprobe, type Probe } from "@/server/media/ffmpeg";
import type { Storage } from "@/server/storage";
import { buildEditDecisions, buildProposal, type PlannedAsset } from "./plan";

async function setStage(db: DB, projectId: string, runId: string, stage: string) {
  await db.update(schema.studioProjects).set({ stage, updatedAt: new Date(), errorMessage: null }).where(eq(schema.studioProjects.id, projectId));
  await db.update(schema.studioPipelineRuns).set({ stage, updatedAt: new Date() }).where(eq(schema.studioPipelineRuns.id, runId));
}

function runPython(script: string, jobFile: string, signal: AbortSignal): Promise<{ code: number; stdout: string; stderr: string }> {
  const python = process.env.OPENMONTAGE_PYTHON || (process.platform === "win32" ? "python" : "python3");
  return new Promise((resolve, reject) => {
    const child = spawn(python, [script, jobFile], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("OpenMontage render timed out"));
    }, 30 * 60 * 1000);
    const stop = () => child.kill("SIGKILL");
    signal.addEventListener("abort", stop, { once: true });
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      signal.removeEventListener("abort", stop);
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

export async function renderStudioJob(db: DB, storage: Storage, projectId: string, exportId: string, signal: AbortSignal): Promise<string> {
  const root = env().OPENMONTAGE_ROOT;
  if (!root) throw Object.assign(new Error("OPENMONTAGE_ROOT is not set on this worker."), { code: "openmontage_missing", retryable: false });
  const [project] = await db.select().from(schema.studioProjects).where(eq(schema.studioProjects.id, projectId)).limit(1);
  const [exp] = await db.select().from(schema.studioExports).where(eq(schema.studioExports.id, exportId)).limit(1);
  const [run] = await db.select().from(schema.studioPipelineRuns).where(eq(schema.studioPipelineRuns.exportId, exportId)).limit(1);
  if (!project || !exp || !run) throw Object.assign(new Error("Production record is missing."), { code: "missing_project", retryable: false });
  if (!project.approvedAt) throw Object.assign(new Error("The scene plan was not approved."), { code: "not_approved", retryable: false });
  const work = await fs.promises.mkdtemp(path.join(os.tmpdir(), "om-"));
  try {
    await setStage(db, project.id, run.id, "ASSET_PREPARATION");
    const assetRows = await db.select().from(schema.studioProjectAssets).where(eq(schema.studioProjectAssets.projectId, project.id));
    const active = assetRows.filter((row) => !row.omitted).sort((a, b) => a.position - b.position);
    if (!active.length) throw Object.assign(new Error("Every shot is omitted."), { code: "no_media", retryable: false });
    const wanted = active.map((row) => row.mediaId);
    if (project.musicMediaId) wanted.push(project.musicMediaId);
    const mediaRows = wanted.length
      ? await db.select().from(schema.media).where(and(eq(schema.media.childId, project.childId), inArray(schema.media.id, wanted)))
      : [];
    const mediaById = new Map(mediaRows.map((row) => [row.id, row]));
    const paths = new Map<string, string>();
    const planned: PlannedAsset[] = [];
    for (const row of active) {
      const media = mediaById.get(row.mediaId);
      if (!media || media.deletedAt) throw Object.assign(new Error("A selected file is no longer in the library."), { code: "media_missing", retryable: false });
      const ext = media.kind === "video" ? ".mp4" : ".jpg";
      const dest = path.join(work, `${row.position.toString().padStart(4, "0")}-${row.mediaId}${ext}`);
      const temp = `${dest}.download`;
      await pipeline(await storage.getStream(media.storageKey), fs.createWriteStream(temp));
      if (media.kind === "image") await sharp(temp).rotate().jpeg({ quality: 90 }).toFile(dest);
      else await fs.promises.rename(temp, dest);
      if (media.kind === "image") await fs.promises.rm(temp, { force: true });
      paths.set(media.id, dest);
      planned.push({
        id: row.id,
        mediaId: media.id,
        kind: media.kind === "video" ? "video" : "image",
        caption: row.caption,
        durationSeconds: row.durationSeconds,
        hero: row.hero,
        dateNeedsReview: media.dateNeedsReview,
        position: row.position,
      });
    }
    let audioPath: string | null = null;
    if (project.musicMediaId) {
      const music = mediaById.get(project.musicMediaId);
      if (!music || music.kind !== "audio") throw Object.assign(new Error("The soundtrack is missing."), { code: "missing_audio", retryable: false });
      audioPath = path.join(work, "soundtrack");
      await pipeline(await storage.getStream(music.storageKey), fs.createWriteStream(audioPath));
    }
    const planRow = await db.select().from(schema.studioScenePlans).where(eq(schema.studioScenePlans.projectId, project.id));
    const latest = planRow.at(-1)?.plan as { scenes?: Parameters<typeof buildEditDecisions>[0]["scenes"] } | undefined;
    const scenes = latest?.scenes ?? [];
    const decisions = buildEditDecisions({
      scenes,
      assets: planned,
      paths,
      renderRuntime: project.renderRuntime === "ffmpeg" ? "ffmpeg" : "remotion",
      rendererFamily: project.rendererFamily,
      profile: exp.profile,
      musicId: project.musicMediaId,
    });
    const manifest = {
      version: "1.0",
      assets: [
        ...planned.map((asset) => ({
          id: asset.mediaId,
          type: asset.kind,
          path: paths.get(asset.mediaId),
          source_tool: "library",
          scene_id: `scene-${asset.id}`,
          provider: "private-library",
          license: "owner",
        })),
        ...(project.musicMediaId && audioPath
          ? [{ id: `music-${project.musicMediaId}`, type: "music", path: audioPath, source_tool: "library", scene_id: "soundtrack", provider: "private-library", license: "owner" }]
          : []),
      ],
    };
    const proposal = buildProposal({
      title: project.title,
      prompt: project.prompt,
      pipeline: project.pipeline,
      profile: exp.profile,
      renderRuntime: decisions.render_runtime,
      rendererFamily: project.rendererFamily,
      assetCount: planned.length,
      undated: planned.filter((asset) => asset.dateNeedsReview).length,
      durationSeconds: scenes.at(-1)?.end_seconds ?? 0,
      referenceUrl: project.referenceUrl,
    });
    const output = path.join(work, "master.mp4");
    const jobFile = path.join(work, "job.json");
    const remotionBrowser = process.env.REMOTION_BROWSER_EXECUTABLE?.trim();
    await fs.promises.writeFile(
      jobFile,
      JSON.stringify({
        openmontage_root: root,
        output_path: output,
        profile: exp.profile,
        edit_decisions: decisions,
        asset_manifest: manifest,
        proposal_packet: proposal,
        scene_plan: scenes,
        audio_path: audioPath,
        ...(remotionBrowser ? { remotion_browser_executable: remotionBrowser } : {}),
      }),
    );
    if (signal.aborted) throw Object.assign(new Error("Cancelled"), { code: "cancelled", retryable: false });
    await setStage(db, project.id, run.id, "RENDERING");
    const script = path.join(process.cwd(), "services", "openmontage", "compose_job.py");
    const result = await runPython(script, jobFile, signal);
    const parsed = parseResult(result.stdout);
    if (parsed.data?.final_review_status === "fail" || result.code !== 0 || !parsed.success) {
      throw Object.assign(new Error(parsed.error || result.stderr.slice(-500) || "OpenMontage render failed"), {
        code: "compose_failed",
        retryable: false,
      });
    }
    await setStage(db, project.id, run.id, "QUALITY_REVIEW");
    const probe = await ffprobe(output);
    const video = probe.streams.find((stream) => stream.codec_type === "video");
    const audio = probe.streams.find((stream) => stream.codec_type === "audio");
    const duration = Number(probe.format.duration ?? 0);
    if (!video || !video.width || !video.height || duration < 1) {
      throw Object.assign(new Error("FFprobe did not find a playable video stream."), { code: "probe_failed", retryable: false });
    }
    if (project.musicMediaId && !audio) {
      throw Object.assign(new Error("The soundtrack was required and the file has no audio stream."), { code: "missing_audio", retryable: false });
    }
    await setStage(db, project.id, run.id, "UPLOADING");
    const key = `studio/${project.childId}/${project.id}/${exp.id}.mp4`;
    await storage.putFile(key, output, "video/mp4");
    const head = await storage.head(key);
    if (!head || head.bytes < 1) throw Object.assign(new Error("The upload did not land in the private bucket."), { code: "upload_failed", retryable: true });
    await db
      .update(schema.studioExports)
      .set({
        status: "ready",
        storageKey: key,
        durationSeconds: duration,
        width: video.width,
        height: video.height,
        probe: { ...summary(probe), finalReview: parsed.data?.final_review_status ?? null },
        errorMessage: null,
      })
      .where(eq(schema.studioExports.id, exp.id));
    await db.update(schema.studioProjects).set({ stage: "COMPLETED", updatedAt: new Date(), errorMessage: null }).where(eq(schema.studioProjects.id, project.id));
    await db.update(schema.studioPipelineRuns).set({ stage: "COMPLETED", updatedAt: new Date(), checkpoint: { bytes: head.bytes } }).where(eq(schema.studioPipelineRuns.id, run.id));
    return key;
  } catch (err) {
    const message = err instanceof Error ? err.message : "Render failed";
    await db.update(schema.studioProjects).set({ stage: "FAILED", errorMessage: message.slice(0, 500), updatedAt: new Date() }).where(eq(schema.studioProjects.id, projectId));
    await db.update(schema.studioExports).set({ status: "failed", errorMessage: message.slice(0, 500) }).where(eq(schema.studioExports.id, exportId));
    throw err;
  } finally {
    await fs.promises.rm(work, { recursive: true, force: true });
  }
}

function parseResult(stdout: string): { success: boolean; error?: string; data?: { final_review_status?: string } } {
  const line = stdout.trim().split("\n").filter(Boolean).at(-1);
  if (!line) return { success: false, error: "OpenMontage returned no result." };
  try {
    return JSON.parse(line) as { success: boolean; error?: string; data?: { final_review_status?: string } };
  } catch {
    return { success: false, error: "OpenMontage returned an unreadable result." };
  }
}

function summary(probe: Probe): Record<string, unknown> {
  return {
    duration: probe.format.duration ?? null,
    streams: probe.streams.map((stream) => ({
      codec_type: stream.codec_type,
      codec_name: stream.codec_name,
      width: stream.width,
      height: stream.height,
      avg_frame_rate: stream.avg_frame_rate,
      channels: stream.channels,
    })),
  };
}
