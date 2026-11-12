import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { json, requireOwner } from "@/server/access";
import { createCinemaProject } from "@/server/cinema";
import { schema } from "@/server/db";
import { filmData } from "@/server/films";
import { readJson, route } from "@/server/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = route(async (req) => {
  const ctx = await requireOwner(req);
  const films = await ctx.db
    .select()
    .from(schema.birthdayFilms)
    .where(eq(schema.birthdayFilms.childId, ctx.child.id))
    .orderBy(desc(schema.birthdayFilms.createdAt));
  return json({
    projects: films.filter((film) => film.skillVersionId).map((film) => ({
      id: film.id,
      title: film.title,
      status: film.status,
      phase: film.cinemaPhase,
      durationTargetSeconds: film.durationTargetSeconds,
      hasRender: !!film.renderedStorageKey,
    })),
  });
});

const body = z.object({
  skillId: z.string().uuid(),
  targetSeconds: z.number().int().min(60).max(600),
}).strict();

export const POST = route(async (req) => {
  const ctx = await requireOwner(req, { write: true });
  const input = body.parse(await readJson(req));
  const { film } = await createCinemaProject(ctx.db, ctx.child, input);
  const data = await filmData(ctx.db, ctx.child, film);
  return json({
    projectId: film.id,
    phase: "PLANNING",
    photoCount: data.plan.photoCount,
    skippedUndated: data.plan.skippedUndated,
    totalSeconds: data.plan.totalSeconds,
  });
});
