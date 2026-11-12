import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePageOwner } from "@/server/access";
import { filmData, getOwnedFilm } from "@/server/films";
import { UUID_RE } from "@/server/http";
import { Theatre } from "@/components/theatre/theatre";

export const dynamic = "force-dynamic";

export const metadata = { title: "Birthday Theatre · Dear Swritsinh" };

export default async function TheatrePage({ params }: { params: Promise<{ filmId: string }> }) {
  const { filmId } = await params;
  if (!UUID_RE.test(filmId)) notFound();
  const { db, child } = await requirePageOwner();
  const film = await getOwnedFilm(db, child.id, filmId).catch(() => null);
  if (!film) notFound();

  if (film.source === "imported") {
    // Past editions play directly through an authenticated, short-lived URL.
    return (
      <div className="fixed inset-0 flex flex-col bg-black text-ivory">
        <div className="flex items-center justify-between gap-4 px-4 py-3">
          <h1 className="font-display truncate text-xl">{film.title}</h1>
          <span className="flex gap-2">
            <a className="btn btn-ghost !min-h-9 text-sm" href={`/api/films/${film.id}/playback?download=1`}>Download</a>
            <Link className="btn btn-ghost !min-h-9 text-sm" href="/app/birthday/5">Exit</Link>
          </span>
        </div>
        <video
          className="min-h-0 w-full flex-1 bg-black"
          src={`/api/films/${film.id}/playback`}
          controls
          playsInline
          autoPlay
          preload="auto"
          data-testid="legacy-film-video"
        />
      </div>
    );
  }

  const data = await filmData(db, child, film);
  return (
    <Theatre
      title={film.title}
      plan={data.plan}
      audio={data.audio}
      backHref="/app/birthday/5"
      childName={child.preferredName}
    />
  );
}
