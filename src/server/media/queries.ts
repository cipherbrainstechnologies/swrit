import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lt, or, sql, type SQL } from "drizzle-orm";
import { HttpError } from "../access";
import { schema, type DB } from "../db";

export type MediaRow = typeof schema.media.$inferSelect;

/** Fields safe to send to the browser (no storage keys, no hashes). */
export function publicMedia(m: MediaRow) {
  return {
    id: m.id,
    kind: m.kind,
    filename: m.filenameOriginal,
    bytes: m.bytes,
    width: m.width,
    height: m.height,
    durationMs: m.durationMs,
    capturedAt: m.capturedAt?.toISOString() ?? null,
    capturedSource: m.capturedSource,
    capturedConfidence: m.capturedConfidence,
    dateNeedsReview: m.dateNeedsReview,
    caption: m.caption,
    story: m.story,
    status: m.status,
    duplicateOfId: m.duplicateOfId,
    favorite: m.favorite,
    isLegacyFilm: m.isLegacyFilm,
    processingError: m.processingError,
    createdAt: m.createdAt.toISOString(),
  };
}
export type PublicMedia = ReturnType<typeof publicMedia>;

/** Every media lookup is scoped to the caller's child: guessed IDs from elsewhere return 404. */
export async function getOwnedMedia(db: DB, childId: string, id: string, opts: { includeDeleted?: boolean } = {}) {
  const rows = await db
    .select()
    .from(schema.media)
    .where(
      and(
        eq(schema.media.id, id),
        eq(schema.media.childId, childId),
        opts.includeDeleted ? undefined : isNull(schema.media.deletedAt),
      ),
    )
    .limit(1);
  if (!rows[0]) throw new HttpError(404, "not_found", "Not found.");
  return rows[0];
}

export type ListFilter = {
  year?: number;
  kind?: "image" | "video" | "audio";
  favorite?: boolean;
  albumId?: string;
  review?: boolean;
  trash?: boolean;
  legacy?: boolean;
  order?: "captured" | "recent";
  cursor?: string;
  limit?: number;
  timeZone: string;
};

export async function listMedia(db: DB, childId: string, f: ListFilter) {
  const conds: (SQL | undefined)[] = [eq(schema.media.childId, childId)];
  conds.push(f.trash ? isNotNull(schema.media.deletedAt) : isNull(schema.media.deletedAt));
  if (f.kind) conds.push(eq(schema.media.kind, f.kind));
  else conds.push(inArray(schema.media.kind, ["image", "video"]));
  if (f.favorite) conds.push(eq(schema.media.favorite, true));
  if (f.review) conds.push(eq(schema.media.dateNeedsReview, true));
  if (f.legacy !== undefined) conds.push(eq(schema.media.isLegacyFilm, f.legacy));
  if (f.year) {
    // Year in the family's timezone.
    conds.push(sql`extract(year from ${schema.media.capturedAt} at time zone ${f.timeZone}) = ${f.year}`);
  }
  if (f.albumId) {
    conds.push(
      sql`${schema.media.id} in (select media_id from album_media where album_id = ${f.albumId})`,
    );
  }
  const limit = Math.min(Math.max(f.limit ?? 60, 1), 200);
  const offset = f.cursor ? Math.max(0, Number.parseInt(f.cursor, 10) || 0) : 0;
  const order =
    f.order === "recent"
      ? [desc(schema.media.createdAt), desc(schema.media.id)]
      : [sql`${schema.media.capturedAt} asc nulls last`, asc(schema.media.createdAt), asc(schema.media.id)];
  const rows = await db
    .select()
    .from(schema.media)
    .where(and(...conds))
    .orderBy(...order)
    .limit(limit + 1)
    .offset(offset);
  return {
    items: rows.slice(0, limit),
    nextCursor: rows.length > limit ? String(offset + limit) : null,
  };
}

export async function yearsWithMedia(db: DB, childId: string, timeZone: string): Promise<{ year: number; count: number }[]> {
  const r = await db
    .select({
      year: sql<number>`extract(year from ${schema.media.capturedAt} at time zone ${timeZone})::int`,
      count: sql<number>`count(*)::int`,
    })
    .from(schema.media)
    .where(
      and(
        eq(schema.media.childId, childId),
        isNull(schema.media.deletedAt),
        isNotNull(schema.media.capturedAt),
        inArray(schema.media.kind, ["image", "video"]),
      ),
    )
    .groupBy(sql`1`)
    .orderBy(sql`1`);
  return r.map((x) => ({ year: Number(x.year), count: Number(x.count) }));
}

export async function mediaCounts(db: DB, childId: string) {
  const [r] = await db
    .select({
      total: sql<number>`count(*) filter (where ${schema.media.kind} in ('image','video'))::int`,
      photos: sql<number>`count(*) filter (where ${schema.media.kind} = 'image')::int`,
      videos: sql<number>`count(*) filter (where ${schema.media.kind} = 'video' and not ${schema.media.isLegacyFilm})::int`,
      review: sql<number>`count(*) filter (where ${schema.media.dateNeedsReview} and ${schema.media.kind} in ('image','video'))::int`,
      favorites: sql<number>`count(*) filter (where ${schema.media.favorite})::int`,
      processing: sql<number>`count(*) filter (where ${schema.media.status} = 'processing')::int`,
      duplicates: sql<number>`count(*) filter (where ${schema.media.status} = 'duplicate')::int`,
    })
    .from(schema.media)
    .where(and(eq(schema.media.childId, childId), isNull(schema.media.deletedAt)));
  return {
    total: Number(r?.total ?? 0),
    photos: Number(r?.photos ?? 0),
    videos: Number(r?.videos ?? 0),
    review: Number(r?.review ?? 0),
    favorites: Number(r?.favorites ?? 0),
    processing: Number(r?.processing ?? 0),
    duplicates: Number(r?.duplicates ?? 0),
  };
}

export async function renditionsFor(db: DB, mediaId: string) {
  return db.select().from(schema.mediaRenditions).where(eq(schema.mediaRenditions.mediaId, mediaId));
}

/** Choose the stored object to serve for a requested variant. */
export async function resolveVariant(
  db: DB,
  m: MediaRow,
  variant: "thumb" | "display" | "poster" | "original" | "playback",
): Promise<{ key: string; mime: string } | null> {
  const r = await renditionsFor(db, m.id);
  const by = (k: string) => r.find((x) => x.kind === k);
  const browserImage = m.mimeDetected && ["image/jpeg", "image/png", "image/webp"].includes(m.mimeDetected);
  const original = { key: m.storageKey, mime: m.mimeDetected ?? "application/octet-stream" };
  const pick = (x?: { storageKey: string; mime: string }) => (x ? { key: x.storageKey, mime: x.mime } : null);
  switch (variant) {
    case "thumb":
      return pick(by("thumbnail")) ?? pick(by("poster")) ?? (m.kind === "image" && browserImage ? original : null);
    case "display":
      return (
        pick(by("optimized")) ??
        pick(by("poster")) ??
        (m.kind === "image" && browserImage ? original : null)
      );
    case "poster":
      return pick(by("poster")) ?? pick(by("optimized")) ?? pick(by("thumbnail"));
    case "playback":
      if (m.kind === "image") return null;
      return pick(by("transcode")) ?? original;
    case "original":
      return original;
  }
}

export async function neighbours(db: DB, childId: string, m: MediaRow) {
  if (!m.capturedAt) return { prev: null, next: null };
  const base = and(eq(schema.media.childId, childId), isNull(schema.media.deletedAt), inArray(schema.media.kind, ["image", "video"]));
  const [prev] = await db
    .select({ id: schema.media.id })
    .from(schema.media)
    .where(and(base, or(lt(schema.media.capturedAt, m.capturedAt), and(eq(schema.media.capturedAt, m.capturedAt), lt(schema.media.id, m.id)))))
    .orderBy(desc(schema.media.capturedAt), desc(schema.media.id))
    .limit(1);
  const [next] = await db
    .select({ id: schema.media.id })
    .from(schema.media)
    .where(
      and(
        base,
        gte(schema.media.capturedAt, m.capturedAt),
        sql`(${schema.media.capturedAt}, ${schema.media.id}) > (${m.capturedAt}, ${m.id})`,
      ),
    )
    .orderBy(asc(schema.media.capturedAt), asc(schema.media.id))
    .limit(1);
  return { prev: prev?.id ?? null, next: next?.id ?? null };
}
