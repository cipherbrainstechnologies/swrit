import { z } from "zod";
import { json, requireOwner } from "@/server/access";
import { ensureBirthdayFilm, listFilms } from "@/server/films";
import { readJson, route } from "@/server/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function publicFilm(f: Awaited<ReturnType<typeof listFilms>>[number]) {
  return {
    id: f.id,
    title: f.title,
    source: f.source,
    status: f.status,
    birthdayAge: f.birthdayAge,
    birthdayYear: f.birthdayYear,
    hasRender: !!f.renderedStorageKey,
    renderedMeta: f.renderedMeta,
    createdAt: f.createdAt.toISOString(),
  };
}

export const GET = route(async (req) => {
  const ctx = await requireOwner(req);
  return json({ films: (await listFilms(ctx.db, ctx.child.id)).map(publicFilm) });
});

const body = z.object({ age: z.number().int().min(1).max(30) });

export const POST = route(async (req) => {
  const ctx = await requireOwner(req, { write: true });
  const { age } = body.parse(await readJson(req));
  const film = await ensureBirthdayFilm(ctx.db, ctx.child, age);
  return json({ film: publicFilm(film) });
});
