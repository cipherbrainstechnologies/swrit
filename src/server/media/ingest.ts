import fsp from "node:fs/promises";
import { and, eq, isNull } from "drizzle-orm";
import { schema, type DB } from "../db";
import { enqueue } from "../jobs/queue";
import { newObjectKey, type Storage } from "../storage";
import { readHead, sha256File } from "./process";
import { kindForMime, safeDisplayName, sniffMime } from "./types";

export type IngestContext = {
  db: DB;
  storage: Storage;
  childId: string;
  ownerUserId: string;
};

/** Create a media row for an object that already exists in storage and queue its processing. */
export async function createMediaFromObject(
  ctx: IngestContext,
  input: {
    storageKey: string;
    filename: string;
    mimeDeclared: string | null;
    mimeDetected: string;
    bytes: number;
    sha256?: string | null;
    sourcePath?: string | null;
    importId?: string | null;
    isLegacyFilm?: boolean;
    capturedAtHint?: Date | null;
  },
) {
  const kind = kindForMime(input.mimeDetected);
  if (!kind) throw new Error("Unsupported media type");
  const [row] = await ctx.db
    .insert(schema.media)
    .values({
      childId: ctx.childId,
      ownerUserId: ctx.ownerUserId,
      storageKey: input.storageKey,
      filenameOriginal: safeDisplayName(input.filename),
      mimeDeclared: input.mimeDeclared,
      mimeDetected: input.mimeDetected,
      kind,
      bytes: input.bytes,
      sha256: input.sha256 ?? null,
      sourcePath: input.sourcePath ?? null,
      importId: input.importId ?? null,
      isLegacyFilm: input.isLegacyFilm ?? false,
      capturedAt: input.capturedAtHint ?? null,
      capturedSource: input.capturedAtHint ? "filesystem" : "unknown",
      capturedConfidence: input.capturedAtHint ? "low" : "none",
      status: "processing",
    })
    .returning();
  await enqueue(ctx.db, "media.process", { mediaId: row.id }, { idempotencyKey: `media.process:${row.id}` });
  if (input.isLegacyFilm) await registerLegacyFilm(ctx.db, ctx.childId, row.id, row.filenameOriginal);
  return row;
}

/** Previously edited birthday films appear in the Theatre as past editions. */
export async function registerLegacyFilm(db: DB, childId: string, mediaId: string, filename: string) {
  const title = filename
    .replace(/\.[a-z0-9]+$/i, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  await db.insert(schema.birthdayFilms).values({
    childId,
    title: title || "Family film",
    source: "imported",
    sourceMediaId: mediaId,
    status: "ready",
  });
}

export async function findDuplicate(db: DB, childId: string, sha256: string) {
  const rows = await db
    .select({ id: schema.media.id })
    .from(schema.media)
    .where(and(eq(schema.media.childId, childId), eq(schema.media.sha256, sha256), isNull(schema.media.deletedAt)))
    .limit(1);
  return rows[0]?.id ?? null;
}

export type LocalIngestResult =
  | { outcome: "accepted"; mediaId: string }
  | { outcome: "duplicate"; mediaId: string }
  | { outcome: "rejected"; reason: string };

/**
 * Ingest a file from local disk (ZIP entry or CLI import). Idempotent by SHA-256:
 * re-importing the same bytes never creates a second copy.
 */
export async function ingestLocalFile(
  ctx: IngestContext,
  file: string,
  meta: { filename: string; sourcePath?: string; importId?: string | null; isLegacyFilm?: boolean; maxBytes: number },
): Promise<LocalIngestResult> {
  const st = await fsp.stat(file);
  if (st.size === 0) return { outcome: "rejected", reason: "Empty file" };
  if (st.size > meta.maxBytes) return { outcome: "rejected", reason: "File is larger than the upload limit" };
  const mime = await sniffMime(await readHead(file));
  const kind = kindForMime(mime);
  if (!mime || !kind) return { outcome: "rejected", reason: "Not a supported photo, video or audio file" };
  if (meta.isLegacyFilm && kind !== "video") return { outcome: "rejected", reason: "Legacy films must be videos" };
  const sha256 = await sha256File(file);
  const dup = await findDuplicate(ctx.db, ctx.childId, sha256);
  if (dup) return { outcome: "duplicate", mediaId: dup };
  const key = newObjectKey("originals");
  await ctx.storage.putFile(key, file, mime);
  const head = await ctx.storage.head(key);
  if (!head || head.bytes !== st.size) {
    await ctx.storage.delete(key).catch(() => {});
    return { outcome: "rejected", reason: "Storage verification failed" };
  }
  const row = await createMediaFromObject(ctx, {
    storageKey: key,
    filename: meta.filename,
    mimeDeclared: null,
    mimeDetected: mime,
    bytes: st.size,
    sha256,
    sourcePath: meta.sourcePath ?? null,
    importId: meta.importId ?? null,
    isLegacyFilm: meta.isLegacyFilm,
  });
  return { outcome: "accepted", mediaId: row.id };
}
