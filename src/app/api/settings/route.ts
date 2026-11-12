import { eq } from "drizzle-orm";
import { z } from "zod";
import { HttpError, json, requireOwner } from "@/server/access";
import { audit } from "@/server/audit";
import { schema } from "@/server/db";
import { readJson, route } from "@/server/http";
import { getOwnedMedia } from "@/server/media/queries";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const body = z
  .object({
    fullName: z.string().trim().min(1).max(120).optional(),
    preferredName: z.string().trim().min(1).max(60).optional(),
    birthDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
    birthDateConfirmed: z.boolean().optional(),
    coverMediaId: z.string().uuid().nullable().optional(),
  })
  .strict();

export const PATCH = route(async (req) => {
  const ctx = await requireOwner(req, { write: true });
  if (ctx.role !== "owner") throw new HttpError(403, "forbidden", "Only the owner can change the profile.");
  const b = body.parse(await readJson(req));
  if (b.birthDate && Number.isNaN(new Date(`${b.birthDate}T00:00:00Z`).getTime())) {
    throw new HttpError(400, "invalid_date", "Invalid birth date.");
  }
  if (b.coverMediaId) {
    const m = await getOwnedMedia(ctx.db, ctx.child.id, b.coverMediaId);
    if (m.kind !== "image") throw new HttpError(400, "not_image", "The cover must be a photo.");
  }
  await ctx.db
    .update(schema.childProfiles)
    .set({ ...b, updatedAt: new Date() })
    .where(eq(schema.childProfiles.id, ctx.child.id));
  await audit(ctx.user.id, "child.updated", "child", ctx.child.id, { fields: Object.keys(b) });
  return json({ ok: true });
});
