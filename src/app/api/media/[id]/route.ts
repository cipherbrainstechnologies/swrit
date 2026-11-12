import { eq } from "drizzle-orm";
import { z } from "zod";
import { HttpError, json, requireOwner } from "@/server/access";
import { audit } from "@/server/audit";
import { schema } from "@/server/db";
import { assertUuid, readJson, route } from "@/server/http";
import { getOwnedMedia, publicMedia } from "@/server/media/queries";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = route<{ id: string }>(async (req, { id }) => {
  const ctx = await requireOwner(req);
  const m = await getOwnedMedia(ctx.db, ctx.child.id, assertUuid(id), { includeDeleted: true });
  return json({ media: publicMedia(m) });
});

const patchSchema = z
  .object({
    caption: z.string().max(500).nullable().optional(),
    story: z.string().max(10_000).nullable().optional(),
    favorite: z.boolean().optional(),
    /** Parent-confirmed capture date (YYYY-MM-DD or full ISO). */
    capturedAt: z
      .string()
      .max(40)
      .refine((s) => !Number.isNaN(new Date(s).getTime()), "invalid date")
      .nullable()
      .optional(),
    confirmDate: z.literal(true).optional(),
    keepDuplicate: z.literal(true).optional(),
    restore: z.literal(true).optional(),
  })
  .strict();

export const PATCH = route<{ id: string }>(async (req, { id }) => {
  const ctx = await requireOwner(req, { write: true });
  const body = patchSchema.parse(await readJson(req, 32 * 1024));
  const m = await getOwnedMedia(ctx.db, ctx.child.id, assertUuid(id), { includeDeleted: !!body.restore });
  const set: Partial<typeof schema.media.$inferInsert> = { updatedAt: new Date() };
  if (body.caption !== undefined) set.caption = body.caption?.trim() || null;
  if (body.story !== undefined) set.story = body.story?.trim() || null;
  if (body.favorite !== undefined) set.favorite = body.favorite;
  if (body.capturedAt !== undefined) {
    if (body.capturedAt === null) {
      Object.assign(set, { capturedAt: null, capturedSource: "unknown", capturedConfidence: "none", dateNeedsReview: true });
    } else {
      // A bare date is interpreted as midday in the family's timezone (Asia/Kolkata by default).
      const s = body.capturedAt;
      const d = /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T12:00:00+05:30`) : new Date(s);
      if (d.getTime() > Date.now() + 86_400_000) throw new HttpError(400, "future_date", "That date is in the future.");
      Object.assign(set, {
        capturedAt: d,
        capturedTimezone: "+05:30",
        capturedSource: "user",
        capturedConfidence: "high",
        dateNeedsReview: false,
      });
    }
  }
  if (body.confirmDate) {
    if (!m.capturedAt) throw new HttpError(400, "no_date", "Set a date first.");
    Object.assign(set, { dateNeedsReview: false, capturedConfidence: "high", capturedSource: "user" });
  }
  if (body.keepDuplicate && m.status === "duplicate") set.status = "ready";
  if (body.restore) set.deletedAt = null;
  const [updated] = await ctx.db.update(schema.media).set(set).where(eq(schema.media.id, m.id)).returning();
  await audit(ctx.user.id, "media.updated", "media", m.id, { fields: Object.keys(body) });
  return json({ media: publicMedia(updated) });
});

/** Soft delete (Trash). Originals are kept; permanent deletion is a separate, explicit flow. */
export const DELETE = route<{ id: string }>(async (req, { id }) => {
  const ctx = await requireOwner(req, { write: true });
  const m = await getOwnedMedia(ctx.db, ctx.child.id, assertUuid(id));
  await ctx.db.update(schema.media).set({ deletedAt: new Date() }).where(eq(schema.media.id, m.id));
  await audit(ctx.user.id, "media.trashed", "media", m.id);
  return json({ ok: true });
});
