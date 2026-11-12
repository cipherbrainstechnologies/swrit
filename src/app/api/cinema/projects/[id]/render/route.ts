import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { HttpError, json, rateLimit, requireOwner } from "@/server/access";
import { audit } from "@/server/audit";
import { validateSkill } from "@/cinema/skill";
import { schema } from "@/server/db";
import { env } from "@/server/env";
import { getOwnedFilm } from "@/server/films";
import { assertUuid, readJson, route } from "@/server/http";
import { enqueue } from "@/server/jobs/queue";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const body = z.object({
  resolution: z.enum(["1080p", "2160p"]),
  idempotencyKey: z.string().min(8).max(80),
}).strict();

/** Queue a preview or final render on the existing worker. One film render at a time is enforced by worker concurrency. */
export const POST = route<{ id: string }>(async (req, { id }) => {
  const ctx = await requireOwner(req, { write: true });
  if (!env().ENABLE_VIDEO_RENDER) throw new HttpError(503, "render_disabled", "Video rendering is turned off on this server.");
  const film = await getOwnedFilm(ctx.db, ctx.child.id, assertUuid(id));
  if (!film.skillVersionId) throw new HttpError(400, "not_cinema", "This film was not created from a cinema skill.");
  const version = (await ctx.db.select().from(schema.cinemaSkillVersions).where(eq(schema.cinemaSkillVersions.id, film.skillVersionId)).limit(1))[0];
  const skill = version ? validateSkill(version.manifest) : null;
  if (!skill?.ok) throw new HttpError(400, "invalid_skill", "The saved skill is no longer valid.");
  if (skill.skill.audio.finale.required) {
    const asset = (
      await ctx.db
        .select()
        .from(schema.cinemaAudioAssets)
        .where(and(eq(schema.cinemaAudioAssets.childId, ctx.child.id), eq(schema.cinemaAudioAssets.role, skill.skill.audio.finale.role)))
        .limit(1)
    )[0];
    if (!asset) throw new HttpError(409, "missing_audio", `Missing required audio asset: ${skill.skill.audio.finale.role}`);
    if (film.audioMediaId !== asset.mediaId || !film.audioRightsConfirmed) {
      throw new HttpError(409, "missing_audio", "Assign the Happy Birthday vocal to this film and confirm you have the right to use it. An instrumental track will not be substituted.");
    }
  }
  const b = body.parse(await readJson(req));
  await rateLimit(ctx.db, `render:${ctx.user.id}`, 10, 3600);
  const active = await ctx.db
    .select({ id: schema.jobs.id })
    .from(schema.jobs)
    .where(and(eq(schema.jobs.filmId, film.id), eq(schema.jobs.status, "processing")))
    .limit(1);
  if (active[0]) throw new HttpError(409, "already_rendering", "A render for this film is already running.");
  const job = await enqueue(
    ctx.db,
    "film.render",
    { filmId: film.id, resolution: b.resolution, requestedBy: ctx.user.id, phase: b.resolution === "2160p" ? "RENDERING" : "PREPARING" },
    { filmId: film.id, idempotencyKey: `film.render:${film.id}:${b.idempotencyKey}`, maxAttempts: 2 },
  );
  await ctx.db.update(schema.birthdayFilms).set({ status: "rendering", cinemaPhase: "QUEUED" }).where(eq(schema.birthdayFilms.id, film.id));
  await audit(ctx.user.id, "cinema.render_requested", "film", film.id, { resolution: b.resolution, jobId: job.id, skillVersionId: film.skillVersionId });
  return json({ job: { id: job.id, status: job.status, phase: "QUEUED" } });
});
