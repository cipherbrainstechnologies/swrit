import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { and, eq, inArray } from "drizzle-orm";
import sharp from "sharp";
import { schema, type DB } from "@/server/db";
import { env } from "@/server/env";
import { ffmpegPath, ffprobe, frameRate, run as runProcess, type Probe } from "@/server/media/ffmpeg";
import { setProgress } from "@/server/jobs/queue";
import type { Storage } from "@/server/storage";
import { findProfile } from "./catalog";
import { buildEditDecisions, buildProposal, buildScenes, deliveryCheck, type PlannedAsset } from "./plan";

/** Pinned chrome-headless-shell from `npx remotion browser ensure` in Dockerfile.openmontage. */
export function remotionHeadlessShellPath(openmontageRoot: string): string {
  const arch = process.arch === "arm64" ? "linux-arm64" : "linux64";
  return path.join(
    openmontageRoot,
    "remotion-composer",
    "node_modules",
    ".remotion",
    "chrome-headless-shell",
    arch,
    `chrome-headless-shell-${arch}`,
    "chrome-headless-shell",
  );
}

async function setStage(db: DB, projectId: string, runId: string, stage: string, progress?: number, jobId?: string | null) {
  await db.update(schema.studioProjects).set({ stage, updatedAt: new Date(), errorMessage: null }).where(eq(schema.studioProjects.id, projectId));
  await db.update(schema.studioPipelineRuns).set({ stage, updatedAt: new Date() }).where(eq(schema.studioPipelineRuns.id, runId));
  if (jobId && progress !== undefined) await setProgress(db, jobId, progress);
}

async function stageStill(source: string, dest: string, width: number, height: number) {
  const fitted = await sharp(source).rotate().resize(width, height, { fit: "inside" }).toBuffer();
  const background = await sharp(source).rotate().resize(width, height, { fit: "cover" }).blur(28).modulate({ brightness: 0.55 }).toBuffer();
  await sharp(background)
    .composite([{ input: fitted, gravity: "centre" }])
    .modulate({ saturation: 1.08 })
    .gamma(1.03)
    .jpeg({ quality: 90 })
    .toFile(dest);
}

async function stageVideo(source: string, dest: string, width: number, height: number) {
  const probed = await ffprobe(source);
  const hasAudio = probed.streams.some((stream) => stream.codec_type === "audio");
  await runProcess(ffmpegPath(), [
    "-y", "-i", source,
    "-vf", `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2:color=black`,
    "-c:v", "libx264", "-pix_fmt", "yuv420p",
    ...(hasAudio ? ["-c:a", "aac"] : ["-an"]),
    "-movflags", "+faststart",
    dest,
  ], { timeoutMs: 10 * 60 * 1000 });
}

async function blackOutsideTitles(file: string, duration: number): Promise<string | null> {
  try {
    const { stderr } = await runProcess(ffmpegPath(), ["-i", file, "-vf", "blackdetect=d=0.8:pix_th=0.05", "-an", "-f", "null", "-"], { timeoutMs: 180_000 });
    const stray = [...stderr.matchAll(/black_start:([\d.]+) black_end:([\d.]+)/g)].some((match) => {
      const start = Number(match[1]);
      const end = Number(match[2]);
      return end > 3.6 && start < duration - 4;
    });
    return stray ? "A black stretch sits outside the opening and closing titles." : null;
  } catch {
    return "FFmpeg could not scan the file for blank frames.";
  }
}

async function meanVolume(file: string): Promise<number | null> {
  try {
    const { stderr } = await runProcess(ffmpegPath(), ["-i", file, "-af", "volumedetect", "-f", "null", "-"], { timeoutMs: 120_000 });
    const match = stderr.match(/mean_volume:\s*(-?[\d.]+)\s*dB/);
    return match ? Number(match[1]) : null;
  } catch {
    return null;
  }
}

/** Wall-clock budget for one Remotion render. OpenMontage itself allows max(10 min, 15s per scene). */
export function renderBudgetMs(shotCount: number, expectedSeconds: number): number {
  const scenes = Math.max(1, shotCount + 2);
  const openMontageSeconds = Math.max(600, scenes * 15);
  const byDuration = Math.ceil(Math.max(expectedSeconds, scenes * 4) * 6);
  const seconds = Math.min(3 * 60 * 60, Math.max(45 * 60, openMontageSeconds + 180, byDuration));
  return seconds * 1000;
}

function killProcessTree(child: ReturnType<typeof spawn>) {
  if (process.platform !== "win32" && child.pid) {
    try {
      process.kill(-child.pid, "SIGKILL");
      return;
    } catch {
      /* The process group is already gone. */
    }
  }
  child.kill("SIGKILL");
}

function runPython(script: string, jobFile: string, signal: AbortSignal, budgetMs: number): Promise<{ code: number; stdout: string; stderr: string }> {
  const python = process.env.OPENMONTAGE_PYTHON || (process.platform === "win32" ? "python" : "python3");
  return new Promise((resolve, reject) => {
    const child = spawn(python, [script, jobFile], {
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32",
    });
    let stdout = "";
    let stderr = "";
    const timer = setTimeout(() => {
      killProcessTree(child);
      const minutes = Math.round(budgetMs / 60_000);
      reject(new Error(`OpenMontage was still rendering after ${minutes} minutes, so the worker stopped it.`));
    }, budgetMs);
    const stop = () => killProcessTree(child);
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
    const profile = findProfile(exp.profile);
    const frameWidth = profile?.width ?? 1920;
    const frameHeight = profile?.height ?? 1080;
    await setStage(db, project.id, run.id, "ASSET_PREPARATION", 0.15, run.jobId);
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
      const temp = `${dest}.source`;
      await pipeline(await storage.getStream(media.storageKey), fs.createWriteStream(temp));
      if (media.kind === "image") await stageStill(temp, dest, frameWidth, frameHeight);
      else await stageVideo(temp, dest, frameWidth, frameHeight);
      await fs.promises.rm(temp, { force: true });
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
    const scenes = buildScenes(planned, project.title);
    await db.insert(schema.studioScenePlans).values({ projectId: project.id, plan: { version: "1.0", scenes } });
    await setStage(db, project.id, run.id, "TIMELINE", 0.4, run.jobId);
    const decisions = buildEditDecisions({
      scenes,
      assets: planned,
      paths,
      renderRuntime: project.renderRuntime === "ffmpeg" ? "ffmpeg" : "remotion",
      rendererFamily: project.rendererFamily,
      profile: exp.profile,
    });
    const { missing, ...edit } = decisions;
    const mediaCuts = (edit.cuts as { source?: string }[]).filter((cut) => cut.source).length;
    if (missing.length || mediaCuts !== planned.length) {
      throw Object.assign(new Error(`The timeline is missing ${planned.length - mediaCuts} of ${planned.length} selected shots. The render stopped instead of delivering the title cards alone.`), {
        code: "incomplete_timeline",
        retryable: false,
      });
    }
    const manifest = {
      version: "1.0",
      assets: [
        ...planned.map((asset) => ({
          id: asset.mediaId,
          type: asset.kind,
          path: paths.get(asset.mediaId),
          source_tool: "library",
          scene_id: `scene-${asset.mediaId}`,
          provider: "private-library",
          license: "owner",
        })),
      ],
    };
    const proposal = buildProposal({
      title: project.title,
      prompt: project.prompt,
      pipeline: project.pipeline,
      profile: exp.profile,
      renderRuntime: edit.render_runtime,
      rendererFamily: project.rendererFamily,
      assetCount: planned.length,
      undated: planned.filter((asset) => asset.dateNeedsReview).length,
      durationSeconds: scenes.at(-1)?.end_seconds ?? 0,
      referenceUrl: project.referenceUrl,
    });
    const budgetMs = renderBudgetMs(planned.length, scenes.at(-1)?.end_seconds ?? 0);
    const output = path.join(work, "master.mp4");
    const jobFile = path.join(work, "job.json");
    const remotionBrowser = remotionHeadlessShellPath(root);
    try {
      await fs.promises.access(remotionBrowser, fs.constants.X_OK);
    } catch {
      throw Object.assign(
        new Error(
          `Remotion headless shell is missing at ${remotionBrowser}. Rebuild and redeploy the openmontage worker image.`,
        ),
        { code: "remotion_browser_missing", retryable: false },
      );
    }
    await fs.promises.writeFile(
      jobFile,
      JSON.stringify({
        openmontage_root: root,
        output_path: output,
        profile: exp.profile,
        edit_decisions: edit,
        asset_manifest: manifest,
        proposal_packet: proposal,
        scene_plan: scenes,
        remotion_browser_executable: remotionBrowser,
        remotion_timeout_ms: Math.max(120_000, budgetMs - 90_000),
        remotion_concurrency: 2,
      }),
    );
    if (signal.aborted) throw Object.assign(new Error("Cancelled"), { code: "cancelled", retryable: false });
    await setStage(db, project.id, run.id, "RENDERING", 0.55, run.jobId);
    const script = path.join(process.cwd(), "services", "openmontage", "compose_job.py");
    const result = await runPython(script, jobFile, signal, budgetMs);
    const parsed = parseResult(result.stdout);
    if (parsed.data?.final_review_status === "fail" || result.code !== 0 || !parsed.success) {
      throw Object.assign(new Error(parsed.error || result.stderr.slice(-500) || "OpenMontage render failed"), {
        code: "compose_failed",
        retryable: false,
      });
    }
    if (audioPath) {
      await setStage(db, project.id, run.id, "AUDIO_MIX", 0.75, run.jobId);
      const mixed = path.join(work, "mixed.mp4");
      const probed = await ffprobe(output);
      const videoSeconds = Number(probed.format.duration ?? 0);
      const fadeOut = Math.max(0, videoSeconds - 2);
      await runProcess(ffmpegPath(), [
        "-y", "-i", output, "-i", audioPath,
        "-filter_complex", `[1:a]afade=t=in:st=0:d=1,afade=t=out:st=${fadeOut}:d=2,loudnorm=I=-16:TP=-1.5:LRA=11[a]`,
        "-map", "0:v:0", "-map", "[a]",
        "-c:v", "copy", "-c:a", "aac", "-b:a", "192k", "-shortest", "-movflags", "+faststart",
        mixed,
      ], { timeoutMs: 10 * 60 * 1000 });
      await fs.promises.rename(mixed, output);
    }
    await setStage(db, project.id, run.id, "QUALITY_REVIEW", 0.85, run.jobId);
    const probe = await ffprobe(output);
    const video = probe.streams.find((stream) => stream.codec_type === "video");
    const audio = probe.streams.find((stream) => stream.codec_type === "audio");
    const duration = Number(probe.format.duration ?? 0);
    if (!video || !video.width || !video.height || duration < 1) {
      throw Object.assign(new Error("FFprobe did not find a playable video stream."), { code: "probe_failed", retryable: false });
    }
    const volume = audio ? await meanVolume(output) : null;
    const expectedSeconds = scenes.at(-1)?.end_seconds ?? 0;
    const problem = deliveryCheck({
      expectedSeconds,
      actualSeconds: duration,
      width: video.width,
      height: video.height,
      profileWidth: frameWidth,
      profileHeight: frameHeight,
      mediaCuts,
      expectedShots: planned.length,
      musicRequired: Boolean(project.musicMediaId),
      meanVolumeDb: volume,
    });
    if (problem) throw Object.assign(new Error(problem), { code: "quality_failed", retryable: false });
    const fps = frameRate(video.avg_frame_rate);
    if (fps && (fps < 23 || fps > 31)) {
      throw Object.assign(new Error(`The file is ${fps.toFixed(2)} fps. The profile expects about 24 or 30.`), { code: "quality_failed", retryable: false });
    }
    await runProcess(ffmpegPath(), ["-v", "error", "-i", output, "-f", "null", "-"], { timeoutMs: 180_000 });
    const black = await blackOutsideTitles(output, duration);
    if (black) throw Object.assign(new Error(black), { code: "quality_failed", retryable: false });
    await setStage(db, project.id, run.id, "UPLOADING", 0.93, run.jobId);
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
        probe: {
          ...summary(probe),
          finalReview: parsed.data?.final_review_status ?? null,
          expectedSeconds,
          mediaCuts,
          meanVolumeDb: volume,
          soundtrack: project.musicMediaId ? "present" : "intentionally-silent",
        },
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
