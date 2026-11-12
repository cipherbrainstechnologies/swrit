import { eq } from "drizzle-orm";
import { z } from "zod";
import { HttpError, json, rateLimit, requireOwner } from "@/server/access";
import { audit } from "@/server/audit";
import { schema } from "@/server/db";
import { env } from "@/server/env";
import { getOwnedFilm } from "@/server/films";
import { assertUuid, readJson, route } from "@/server/http";
import { enqueue } from "@/server/jobs/queue";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const body = z.object({
  resolution: z.enum(["1080p", "2160p"]).default("1080p"),
  idempotencyKey: z.string().min(8).max(80),
});

/** Queue a real MP4 render on the worker. Never renders inside the request. */
export const POST = route<{ id: string }>(async (req, { id }) => {
  const ctx = await requireOwner(req, { write: true });
  if (!env().ENABLE_VIDEO_RENDER) throw new HttpError(503, "render_disabled", "Video rendering is turned off on this server.");
  const film = await getOwnedFilm(ctx.db, ctx.child.id, assertUuid(id));
  if (film.source !== "slideshow") throw new HttpError(400, "not_slideshow", "Imported films are already videos.");
  const b = body.parse(await readJson(req));
  await rateLimit(ctx.db, `render:${ctx.user.id}`, 10, 3600);
  const job = await enqueue(
    ctx.db,
    "film.render",
    { filmId: film.id, resolution: b.resolution, requestedBy: ctx.user.id },
    { filmId: film.id, idempotencyKey: `film.render:${film.id}:${b.idempotencyKey}`, maxAttempts: 2 },
  );
  await ctx.db.update(schema.birthdayFilms).set({ status: "rendering" }).where(eq(schema.birthdayFilms.id, film.id));
  await audit(ctx.user.id, "film.render_requested", "film", film.id, { resolution: b.resolution, jobId: job.id });
  return json({ job: { id: job.id, status: job.status, progress: job.progress } });
});
