import { and, eq } from "drizzle-orm";
import { HttpError, json, requireOwner } from "@/server/access";
import { schema } from "@/server/db";
import { assertUuid, route } from "@/server/http";
import { cancelJob } from "@/server/jobs/queue";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const POST = route<{ id: string }>(async (req, { id }) => {
  const ctx = await requireOwner(req, { write: true });
  const rows = await ctx.db
    .select({ id: schema.jobs.id, filmId: schema.jobs.filmId })
    .from(schema.jobs)
    .innerJoin(schema.birthdayFilms, eq(schema.birthdayFilms.id, schema.jobs.filmId))
    .where(and(eq(schema.jobs.id, assertUuid(id)), eq(schema.birthdayFilms.childId, ctx.child.id)))
    .limit(1);
  if (!rows[0]) throw new HttpError(404, "not_found", "Job not found.");
  await cancelJob(ctx.db, rows[0].id);
  if (rows[0].filmId) {
    await ctx.db.update(schema.birthdayFilms).set({ status: "draft" }).where(eq(schema.birthdayFilms.id, rows[0].filmId));
  }
  return json({ ok: true });
});
