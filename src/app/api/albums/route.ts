import { asc, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { HttpError, json, requireOwner } from "@/server/access";
import { schema } from "@/server/db";
import { readJson, route } from "@/server/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = route(async (req) => {
  const ctx = await requireOwner(req);
  const rows = await ctx.db
    .select({
      id: schema.albums.id,
      name: schema.albums.name,
      description: schema.albums.description,
      coverMediaId: schema.albums.coverMediaId,
      count: sql<number>`(select count(*)::int from album_media am join media m on m.id = am.media_id where am.album_id = ${schema.albums.id} and m.deleted_at is null)`,
    })
    .from(schema.albums)
    .where(eq(schema.albums.childId, ctx.child.id))
    .orderBy(asc(schema.albums.createdAt));
  return json({ albums: rows.map((r) => ({ ...r, count: Number(r.count) })) });
});

const body = z.object({ name: z.string().trim().min(1).max(80), description: z.string().max(500).optional() });

export const POST = route(async (req) => {
  const ctx = await requireOwner(req, { write: true });
  const b = body.parse(await readJson(req));
  const [a] = await ctx.db
    .insert(schema.albums)
    .values({ childId: ctx.child.id, name: b.name, description: b.description ?? null })
    .onConflictDoNothing()
    .returning();
  if (!a) throw new HttpError(409, "exists", "An album with that name already exists.");
  return json({ album: a });
});
