import { desc, eq } from "drizzle-orm";
import { json, requireOwner } from "@/server/access";
import { schema } from "@/server/db";
import { getOwnedFilm } from "@/server/films";
import { assertUuid, route } from "@/server/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = route<{ id: string }>(async (req, { id }) => {
  const ctx = await requireOwner(req);
  const film = await getOwnedFilm(ctx.db, ctx.child.id, assertUuid(id));
  const jobs = await ctx.db
    .select()
    .from(schema.jobs)
    .where(eq(schema.jobs.filmId, film.id))
    .orderBy(desc(schema.jobs.createdAt))
    .limit(10);
  return json({
    film: { status: film.status, hasRender: !!film.renderedStorageKey, renderedMeta: film.renderedMeta },
    jobs: jobs.map((j) => ({
      id: j.id,
      status: j.status,
      progress: j.progress,
      attempts: j.attempts,
      resolution: j.payload.resolution ?? null,
      errorCode: j.errorCode,
      errorMessage: j.errorMessage,
      createdAt: j.createdAt.toISOString(),
      finishedAt: j.finishedAt?.toISOString() ?? null,
    })),
  });
});
