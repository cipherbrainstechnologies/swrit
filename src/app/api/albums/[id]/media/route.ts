import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { HttpError, json, requireOwner } from "@/server/access";
import { schema } from "@/server/db";
import { assertUuid, readJson, route } from "@/server/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const body = z.object({
  mediaIds: z.array(z.string().uuid()).min(1).max(500),
  action: z.enum(["add", "remove"]).default("add"),
});

export const POST = route<{ id: string }>(async (req, { id }) => {
  const ctx = await requireOwner(req, { write: true });
  const albumId = assertUuid(id);
  const album = (
    await ctx.db
      .select()
      .from(schema.albums)
      .where(and(eq(schema.albums.id, albumId), eq(schema.albums.childId, ctx.child.id)))
      .limit(1)
  )[0];
  if (!album) throw new HttpError(404, "not_found", "Album not found.");
  const b = body.parse(await readJson(req, 128 * 1024));
  // Only media belonging to this child can be added.
  const owned = await ctx.db
    .select({ id: schema.media.id })
    .from(schema.media)
    .where(and(eq(schema.media.childId, ctx.child.id), inArray(schema.media.id, b.mediaIds), isNull(schema.media.deletedAt)));
  const ids = owned.map((o) => o.id);
  if (b.action === "remove") {
    if (ids.length)
      await ctx.db
        .delete(schema.albumMedia)
        .where(and(eq(schema.albumMedia.albumId, album.id), inArray(schema.albumMedia.mediaId, ids)));
  } else if (ids.length) {
    const [{ max }] = await ctx.db
      .select({ max: sql<number>`coalesce(max(${schema.albumMedia.position}), 0)::int` })
      .from(schema.albumMedia)
      .where(eq(schema.albumMedia.albumId, album.id));
    await ctx.db
      .insert(schema.albumMedia)
      .values(ids.map((mediaId, i) => ({ albumId: album.id, mediaId, position: Number(max) + i + 1 })))
      .onConflictDoNothing();
    if (!album.coverMediaId) await ctx.db.update(schema.albums).set({ coverMediaId: ids[0] }).where(eq(schema.albums.id, album.id));
  }
  return json({ ok: true, affected: ids.length });
});
