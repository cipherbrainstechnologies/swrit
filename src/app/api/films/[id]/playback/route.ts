import { HttpError, NO_STORE, requireOwner } from "@/server/access";
import { env } from "@/server/env";
import { getOwnedFilm } from "@/server/films";
import { assertUuid, route } from "@/server/http";
import { getOwnedMedia, resolveVariant } from "@/server/media/queries";
import { getStorage } from "@/server/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Authenticated playback / download of an imported film or a verified render. */
export const GET = route<{ id: string }>(async (req, { id }) => {
  const ctx = await requireOwner(req);
  const film = await getOwnedFilm(ctx.db, ctx.child.id, assertUuid(id));
  const download = new URL(req.url).searchParams.get("download") === "1";
  const storage = await getStorage();
  let key: string;
  let name: string;
  if (film.source === "imported") {
    if (!film.sourceMediaId) throw new HttpError(404, "not_found", "Film file missing.");
    const m = await getOwnedMedia(ctx.db, ctx.child.id, film.sourceMediaId);
    const v = await resolveVariant(ctx.db, m, download ? "original" : "playback");
    if (!v) throw new HttpError(404, "not_found", "Film file missing.");
    key = v.key;
    name = m.filenameOriginal;
  } else {
    if (!film.renderedStorageKey || !film.verifiedAt) throw new HttpError(404, "not_rendered", "This film has not been rendered yet.");
    key = film.renderedStorageKey;
    name = `${film.title.replace(/[^a-z0-9 _-]/gi, "").trim() || "birthday-film"}.mp4`;
  }
  const url = await storage.presignGet(key, Math.max(env().MEDIA_SIGNED_URL_TTL_SECONDS, 600), {
    contentType: "video/mp4",
    downloadName: download ? name : undefined,
  });
  return new Response(null, { status: 302, headers: { Location: url, ...NO_STORE, "Referrer-Policy": "no-referrer" } });
});
