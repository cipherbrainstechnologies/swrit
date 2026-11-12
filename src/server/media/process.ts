import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { and, eq, isNull, ne } from "drizzle-orm";
import sharp from "sharp";
import { schema, type DB } from "../db";
import type { Storage } from "../storage";
import { newObjectKey } from "../storage";
import { inferCaptureDate } from "./dates";
import { ffmpegPath, ffprobe, run } from "./ffmpeg";
import { kindForMime, sniffMime } from "./types";

sharp.concurrency(1);
sharp.cache(false);

export async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "dear-swritsinh-"));
  try {
    return await fn(dir);
  } finally {
    await fsp.rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

export async function sha256File(file: string): Promise<string> {
  const hash = crypto.createHash("sha256");
  await pipeline(fs.createReadStream(file), hash);
  return hash.digest("hex");
}

export async function readHead(file: string, bytes = 4100): Promise<Buffer> {
  const fh = await fsp.open(file, "r");
  try {
    const buf = Buffer.alloc(bytes);
    const { bytesRead } = await fh.read(buf, 0, bytes, 0);
    return buf.subarray(0, bytesRead);
  } finally {
    await fh.close();
  }
}

async function download(storage: Storage, key: string, dest: string): Promise<void> {
  await pipeline(await storage.getStream(key), fs.createWriteStream(dest));
}

async function saveRendition(
  db: DB,
  storage: Storage,
  mediaId: string,
  kind: "poster" | "thumbnail" | "optimized" | "transcode",
  file: string,
  mime: string,
  dims: { width?: number; height?: number },
): Promise<void> {
  const ext = mime === "video/mp4" ? ".mp4" : mime === "image/webp" ? ".webp" : ".jpg";
  const key = `${newObjectKey("renditions")}${ext}`;
  await storage.putFile(key, file, mime);
  const bytes = (await fsp.stat(file)).size;
  const existing = await db
    .select()
    .from(schema.mediaRenditions)
    .where(and(eq(schema.mediaRenditions.mediaId, mediaId), eq(schema.mediaRenditions.kind, kind)))
    .limit(1);
  if (existing[0]) {
    await db
      .update(schema.mediaRenditions)
      .set({ storageKey: key, mime, bytes, width: dims.width ?? null, height: dims.height ?? null, generatedAt: new Date() })
      .where(eq(schema.mediaRenditions.id, existing[0].id));
    await storage.delete(existing[0].storageKey).catch(() => {});
  } else {
    await db.insert(schema.mediaRenditions).values({
      mediaId,
      kind,
      storageKey: key,
      mime,
      bytes,
      width: dims.width ?? null,
      height: dims.height ?? null,
    });
  }
}

/** Generate thumbnail + optimised web image. EXIF/GPS is stripped from derivatives. */
async function imageDerivatives(db: DB, storage: Storage, mediaId: string, src: string, dir: string) {
  const base = sharp(src, { failOn: "none", limitInputPixels: 268_402_689 }).rotate();
  const meta = await sharp(src, { failOn: "none" }).metadata();
  const thumb = path.join(dir, "thumb.webp");
  const opt = path.join(dir, "opt.webp");
  const t = await base.clone().resize({ width: 640, height: 640, fit: "inside", withoutEnlargement: true }).webp({ quality: 78 }).toFile(thumb);
  const o = await base
    .clone()
    .resize({ width: 2560, height: 2560, fit: "inside", withoutEnlargement: true })
    .webp({ quality: 84 })
    .toFile(opt);
  await saveRendition(db, storage, mediaId, "thumbnail", thumb, "image/webp", t);
  await saveRendition(db, storage, mediaId, "optimized", opt, "image/webp", o);
  const swap = (meta.orientation ?? 1) >= 5;
  return {
    width: swap ? meta.height : meta.width,
    height: swap ? meta.width : meta.height,
    orientation: meta.orientation ?? null,
  };
}

export type ProcessResult = { status: "ready" | "preview_unavailable" | "duplicate" | "failed"; error?: string };

export async function processMedia(
  db: DB,
  storage: Storage,
  mediaId: string,
  opts: { signal?: AbortSignal } = {},
): Promise<ProcessResult> {
  const rows = await db.select().from(schema.media).where(eq(schema.media.id, mediaId)).limit(1);
  const m = rows[0];
  if (!m) return { status: "failed", error: "Media not found" };
  const child = (await db.select().from(schema.childProfiles).where(eq(schema.childProfiles.id, m.childId)).limit(1))[0];

  return withTempDir(async (dir) => {
    const src = path.join(dir, "original");
    await download(storage, m.storageKey, src);
    const bytes = (await fsp.stat(src)).size;
    const sha256 = await sha256File(src);
    const detected = (await sniffMime(await readHead(src))) ?? m.mimeDetected ?? null;
    const kind = kindForMime(detected) ?? m.kind;

    const update: Partial<typeof schema.media.$inferInsert> = {
      bytes,
      sha256,
      mimeDetected: detected,
      kind,
      updatedAt: new Date(),
      processingError: null,
    };

    // Exact duplicate detection. Originals are never deleted automatically.
    const dup = await db
      .select({ id: schema.media.id })
      .from(schema.media)
      .where(
        and(
          eq(schema.media.childId, m.childId),
          eq(schema.media.sha256, sha256),
          ne(schema.media.id, m.id),
          isNull(schema.media.deletedAt),
        ),
      )
      .limit(1);

    let exif: Record<string, unknown> | null = null;
    let status: ProcessResult["status"] = "ready";
    let error: string | undefined;

    try {
      if (kind === "image") {
        try {
          const exifr = (await import("exifr")).default;
          exif = (await exifr.parse(src, {
            pick: ["DateTimeOriginal", "CreateDate", "OffsetTimeOriginal", "OffsetTime", "Orientation"],
            reviveValues: false,
          })) as Record<string, unknown> | null;
        } catch {
          exif = null;
        }
        try {
          Object.assign(update, await imageDerivatives(db, storage, m.id, src, dir));
        } catch (err) {
          // e.g. HEIC without a HEVC decoder: the original is kept and downloadable.
          status = "preview_unavailable";
          error = `Preview could not be generated: ${String(err).slice(0, 160)}`;
        }
      } else if (kind === "video") {
        const probe = await ffprobe(src);
        const v = probe.streams.find((s) => s.codec_type === "video");
        const rotation = Math.abs(v?.side_data_list?.find((d) => d.rotation !== undefined)?.rotation ?? Number(v?.tags?.rotate ?? 0));
        const swap = rotation === 90 || rotation === 270;
        update.width = (swap ? v?.height : v?.width) ?? null;
        update.height = (swap ? v?.width : v?.height) ?? null;
        update.durationMs = Math.round(Number(probe.format.duration ?? v?.duration ?? 0) * 1000) || null;
        const created = probe.format.tags?.creation_time ?? v?.tags?.creation_time;
        const createdDate = created ? new Date(created) : null;
        // Container creation_time is UTC; 1970/1904 epochs mean "unset".
        if (createdDate && !Number.isNaN(createdDate.getTime()) && createdDate.getUTCFullYear() > 2000) {
          const iso = createdDate.toISOString(); // YYYY-MM-DDTHH:MM:SS
          exif = {
            DateTimeOriginal: `${iso.slice(0, 10).replace(/-/g, ":")} ${iso.slice(11, 19)}`,
            OffsetTimeOriginal: "+00:00",
          };
        }

        const posterRaw = path.join(dir, "poster.jpg");
        const at = Math.min(1, (update.durationMs ?? 0) / 2000).toFixed(2);
        await run(ffmpegPath(), ["-y", "-ss", at, "-i", src, "-frames:v", "1", "-q:v", "3", posterRaw], {
          timeoutMs: 120_000,
          signal: opts.signal,
        });
        const poster = path.join(dir, "poster.webp");
        const thumb = path.join(dir, "thumb.webp");
        const p = await sharp(posterRaw).resize({ width: 1920, height: 1920, fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toFile(poster);
        const t = await sharp(posterRaw).resize({ width: 640, height: 640, fit: "inside" }).webp({ quality: 76 }).toFile(thumb);
        await saveRendition(db, storage, m.id, "poster", poster, "image/webp", p);
        await saveRendition(db, storage, m.id, "thumbnail", thumb, "image/webp", t);

        // Browsers reliably play H.264 in MP4. Anything else gets a 1080p H.264 copy; the original is untouched.
        const browserFriendly = v?.codec_name === "h264" && /mp4|mov/.test(probe.format.format_name ?? "");
        const longVideo = (update.durationMs ?? 0) > 20 * 60_000;
        if (!browserFriendly && !longVideo) {
          const out = path.join(dir, "transcode.mp4");
          await run(
            ffmpegPath(),
            [
              "-y", "-i", src,
              "-vf", "scale='min(1920,iw)':-2:flags=lanczos,format=yuv420p",
              "-c:v", "libx264", "-preset", "veryfast", "-crf", "21",
              "-c:a", "aac", "-b:a", "160k", "-ac", "2",
              "-movflags", "+faststart", "-map_metadata", "-1",
              out,
            ],
            { timeoutMs: 60 * 60_000, signal: opts.signal },
          );
          const tp = await ffprobe(out);
          const tv = tp.streams.find((s) => s.codec_type === "video");
          await saveRendition(db, storage, m.id, "transcode", out, "video/mp4", { width: tv?.width, height: tv?.height });
        }
      } else if (kind === "audio") {
        const probe = await ffprobe(src);
        update.durationMs = Math.round(Number(probe.format.duration ?? 0) * 1000) || null;
      }
    } catch (err) {
      if (opts.signal?.aborted) throw err;
      status = "failed";
      error = `Processing failed: ${String(err).slice(0, 200)}`;
    }

    // Capture date: never overwrite a parent-entered date.
    if (m.capturedSource !== "user" && child) {
      const inferred = inferCaptureDate({
        exif: exif as never,
        filename: m.filenameOriginal,
        birthDate: child.birthDate,
        hint: m.capturedAt && m.capturedSource === "filesystem" ? m.capturedAt : null,
      });
      update.capturedAt = inferred.capturedAt;
      update.capturedTimezone = inferred.timezone;
      update.capturedSource = inferred.source;
      update.capturedConfidence = inferred.confidence;
      update.dateNeedsReview = inferred.needsReview;
    }

    if (dup[0] && status !== "failed") {
      status = "duplicate";
      update.duplicateOfId = dup[0].id;
    }
    update.status = status;
    update.processingError = error ?? null;
    await db.update(schema.media).set(update).where(eq(schema.media.id, m.id));
    return { status, error };
  });
}
