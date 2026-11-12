import { eq } from "drizzle-orm";
import { z } from "zod";
import { json, requireOwner } from "@/server/access";
import { assignAudioRole } from "@/server/cinema";
import { schema } from "@/server/db";
import { readJson, route } from "@/server/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = route(async (req) => {
  const ctx = await requireOwner(req);
  const assets = await ctx.db.select().from(schema.cinemaAudioAssets).where(eq(schema.cinemaAudioAssets.childId, ctx.child.id));
  return json({ assets: assets.map((asset) => ({ id: asset.id, mediaId: asset.mediaId, role: asset.role })) });
});

const body = z.object({
  mediaId: z.string().uuid(),
  role: z.enum(["happy_birthday_vocal_standard", "instrumental"]),
  filmId: z.string().uuid().optional(),
  rightsConfirmed: z.boolean().optional(),
}).strict();

export const POST = route(async (req) => {
  const ctx = await requireOwner(req, { write: true });
  const input = body.parse(await readJson(req));
  const asset = await assignAudioRole(ctx.db, ctx.child.id, input.mediaId, input.role);
  if (input.filmId && input.role === "happy_birthday_vocal_standard") {
    await ctx.db
      .update(schema.birthdayFilms)
      .set({ audioMediaId: input.mediaId, audioRightsConfirmed: input.rightsConfirmed === true, updatedAt: new Date() })
      .where(eq(schema.birthdayFilms.id, input.filmId));
  }
  return json({ id: asset.id, role: asset.role });
});
