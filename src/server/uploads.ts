import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { HttpError, rateLimit, type OwnerContext } from "./access";
import { audit } from "./audit";
import { schema } from "./db";
import { env } from "./env";
import { enqueue } from "./jobs/queue";
import { createMediaFromObject, findDuplicate } from "./media/ingest";
import { declaredMimeAllowed, kindForMime, safeDisplayName, sniffMime, ZIP_MIME } from "./media/types";
import { getStorage, newObjectKey } from "./storage";

export const MULTIPART_THRESHOLD = 64 * 1024 * 1024;
export const PART_SIZE = 16 * 1024 * 1024;
const UPLOAD_URL_TTL = 15 * 60;

export const initSchema = z.object({
  filename: z.string().min(1).max(300),
  mime: z.string().max(120).default("application/octet-stream"),
  bytes: z.number().int().positive(),
  sha256: z.string().regex(/^[0-9a-f]{64}$/).optional(),
  lastModified: z.number().int().positive().optional(),
  purpose: z.enum(["media", "import", "audio", "legacy_film"]).default("media"),
  allowDuplicate: z.boolean().default(false),
});

export async function initUpload(ctx: OwnerContext, input: z.infer<typeof initSchema>) {
  const e = env();
  await rateLimit(ctx.db, `upload-init:${ctx.user.id}`, 600, 600);
  const mime = input.mime || "application/octet-stream";
  if (input.bytes > e.MAX_UPLOAD_MB * 1024 * 1024) {
    throw new HttpError(413, "too_large", `Files up to ${e.MAX_UPLOAD_MB} MB are supported.`);
  }
  if (!declaredMimeAllowed(mime, input.purpose)) {
    throw new HttpError(415, "unsupported_type", "This file type is not supported.");
  }
  if (input.sha256 && !input.allowDuplicate && input.purpose !== "import") {
    const dup = await findDuplicate(ctx.db, ctx.child.id, input.sha256);
    if (dup) return { duplicate: { mediaId: dup } } as const;
  }
  const storage = await getStorage();
  const key = newObjectKey(input.purpose === "import" ? "imports" : input.purpose === "audio" ? "audio" : "originals");
  const multipart = input.bytes > MULTIPART_THRESHOLD;
  const uploadId = multipart ? await storage.createMultipart(key, mime) : null;
  const hint =
    input.lastModified && input.lastModified > Date.UTC(2000, 0, 1) && input.lastModified < Date.now() + 86_400_000
      ? new Date(input.lastModified)
      : null;
  const [session] = await ctx.db
    .insert(schema.uploadSessions)
    .values({
      ownerUserId: ctx.user.id,
      childId: ctx.child.id,
      purpose: input.purpose,
      objectKey: key,
      filename: safeDisplayName(input.filename),
      mimeDeclared: mime,
      checksum: input.sha256 ?? null,
      expectedBytes: input.bytes,
      multipartUploadId: uploadId,
      partSize: multipart ? PART_SIZE : null,
      capturedAtHint: hint,
      expiresAt: new Date(Date.now() + (multipart ? 24 * 3600 : 2 * 3600) * 1000),
    })
    .returning();
  if (multipart) {
    return {
      sessionId: session.id,
      multipart: { partSize: PART_SIZE, partCount: Math.ceil(input.bytes / PART_SIZE) },
    } as const;
  }
  return {
    sessionId: session.id,
    putUrl: await storage.presignPut(key, mime, UPLOAD_URL_TTL),
    headers: { "Content-Type": mime },
  } as const;
}

async function loadSession(ctx: OwnerContext, sessionId: string) {
  const rows = await ctx.db
    .select()
    .from(schema.uploadSessions)
    .where(and(eq(schema.uploadSessions.id, sessionId), eq(schema.uploadSessions.ownerUserId, ctx.user.id)))
    .limit(1);
  const s = rows[0];
  if (!s) throw new HttpError(404, "not_found", "Upload not found.");
  if (s.uploadState !== "pending") throw new HttpError(409, "not_pending", "This upload is already finished.");
  if (s.expiresAt.getTime() < Date.now()) throw new HttpError(410, "expired", "This upload expired. Please retry.");
  return s;
}

export const partSchema = z.object({
  sessionId: z.string().uuid(),
  partNumbers: z.array(z.number().int().min(1).max(10000)).min(1).max(50),
});

export async function presignParts(ctx: OwnerContext, input: z.infer<typeof partSchema>) {
  const s = await loadSession(ctx, input.sessionId);
  if (!s.multipartUploadId) throw new HttpError(400, "not_multipart", "Not a multipart upload.");
  const storage = await getStorage();
  const urls: Record<number, string> = {};
  for (const n of input.partNumbers) {
    urls[n] = await storage.presignPart(s.objectKey, s.multipartUploadId, n, UPLOAD_URL_TTL);
  }
  return { urls };
}

export const completeSchema = z.object({
  sessionId: z.string().uuid(),
  parts: z
    .array(z.object({ partNumber: z.number().int().min(1).max(10000), etag: z.string().min(1).max(200) }))
    .max(10000)
    .optional(),
});

export async function completeUpload(ctx: OwnerContext, input: z.infer<typeof completeSchema>) {
  const s = await loadSession(ctx, input.sessionId);
  const storage = await getStorage();
  if (s.multipartUploadId) {
    if (!input.parts?.length) throw new HttpError(400, "missing_parts", "Missing upload parts.");
    await storage.completeMultipart(s.objectKey, s.multipartUploadId, input.parts);
  }
  const reject = async (status: number, code: string, message: string) => {
    await storage.delete(s.objectKey).catch(() => {});
    await ctx.db.update(schema.uploadSessions).set({ uploadState: "aborted" }).where(eq(schema.uploadSessions.id, s.id));
    throw new HttpError(status, code, message);
  };
  const head = await storage.head(s.objectKey);
  if (!head) throw new HttpError(409, "not_uploaded", "The file has not finished uploading.");
  if (head.bytes !== s.expectedBytes) {
    await reject(422, "size_mismatch", "The uploaded file is incomplete. Please retry.");
  }
  // Verify the real type from magic bytes, never trusting the declared MIME.
  const stream = await storage.getStream(s.objectKey, { start: 0, end: Math.min(head.bytes, 4100) - 1 });
  const chunks: Buffer[] = [];
  for await (const c of stream) chunks.push(c as Buffer);
  const detected = await sniffMime(Buffer.concat(chunks));

  if (s.purpose === "import") {
    if (!detected || !ZIP_MIME.has(detected)) await reject(422, "not_zip", "That file is not a ZIP archive.");
    const [imp] = await ctx.db
      .insert(schema.imports)
      .values({
        ownerUserId: ctx.user.id,
        childId: ctx.child.id,
        sourceArchiveStorageKey: s.objectKey,
        sourceLabel: s.filename,
      })
      .returning();
    await enqueue(ctx.db, "import.zip", { importId: imp.id }, { idempotencyKey: `import.zip:${imp.id}`, maxAttempts: 3 });
    await ctx.db
      .update(schema.uploadSessions)
      .set({ uploadState: "completed", completedAt: new Date() })
      .where(eq(schema.uploadSessions.id, s.id));
    await audit(ctx.user.id, "import.created", "import", imp.id, { bytes: head.bytes });
    return { importId: imp.id };
  }

  const kind = kindForMime(detected);
  const ok =
    (s.purpose === "media" && (kind === "image" || kind === "video")) ||
    (s.purpose === "legacy_film" && kind === "video") ||
    (s.purpose === "audio" && (kind === "audio" || detected === "video/mp4"));
  if (!ok || !detected) await reject(415, "unsupported_type", "This file is not a supported photo, video or audio file.");

  const media = await createMediaFromObject(
    { db: ctx.db, storage, childId: ctx.child.id, ownerUserId: ctx.user.id },
    {
      storageKey: s.objectKey,
      filename: s.filename,
      mimeDeclared: s.mimeDeclared,
      mimeDetected: s.purpose === "audio" && detected === "video/mp4" ? "audio/mp4" : detected!,
      bytes: head.bytes,
      sha256: null, // computed by the worker from the stored bytes
      isLegacyFilm: s.purpose === "legacy_film",
      capturedAtHint: s.capturedAtHint,
    },
  );
  await ctx.db
    .update(schema.uploadSessions)
    .set({ uploadState: "completed", completedAt: new Date() })
    .where(eq(schema.uploadSessions.id, s.id));
  await audit(ctx.user.id, "media.uploaded", "media", media.id, { kind: media.kind, bytes: head.bytes });
  return { media: { id: media.id, kind: media.kind, status: media.status } };
}

export const abortSchema = z.object({ sessionId: z.string().uuid() });

export async function abortUpload(ctx: OwnerContext, input: z.infer<typeof abortSchema>) {
  const rows = await ctx.db
    .select()
    .from(schema.uploadSessions)
    .where(and(eq(schema.uploadSessions.id, input.sessionId), eq(schema.uploadSessions.ownerUserId, ctx.user.id)))
    .limit(1);
  const s = rows[0];
  if (!s || s.uploadState !== "pending") return { ok: true };
  const storage = await getStorage();
  try {
    if (s.multipartUploadId) await storage.abortMultipart(s.objectKey, s.multipartUploadId);
    else await storage.delete(s.objectKey);
  } catch {
    /* best effort; the maintenance sweep retries */
  }
  await ctx.db.update(schema.uploadSessions).set({ uploadState: "aborted" }).where(eq(schema.uploadSessions.id, s.id));
  return { ok: true };
}
