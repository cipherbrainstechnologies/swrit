import { notFound } from "next/navigation";
import { requirePageOwner } from "@/server/access";
import { filmData, getOwnedFilm } from "@/server/films";
import { UUID_RE } from "@/server/http";
import { CinemaProject } from "./project";

export const dynamic = "force-dynamic";

export default async function CinemaProjectPage({ params }: { params: Promise<{ filmId: string }> }) {
  const { filmId } = await params;
  if (!UUID_RE.test(filmId)) notFound();
  const { db, child } = await requirePageOwner();
  const film = await getOwnedFilm(db, child.id, filmId).catch(() => null);
  if (!film?.skillVersionId) notFound();
  const data = await filmData(db, child, film);
  return (
    <div className="py-8">
      <CinemaProject
        filmId={film.id}
        title={film.title}
        phase={film.cinemaPhase}
        status={film.status}
        skippedUndated={data.plan.skippedUndated}
        hasRender={!!film.renderedStorageKey}
        shots={data.plan.scenes.flatMap((scene) =>
          scene.type === "photo"
            ? [{ mediaId: scene.mediaId, caption: scene.caption, duration: scene.duration, chapterKey: scene.chapterKey }]
            : [],
        )}
      />
    </div>
  );
}
