import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { requirePageOwner } from "@/server/access";
import { schema } from "@/server/db";
import { filmData, getOwnedFilm } from "@/server/films";
import { UUID_RE } from "@/server/http";
import { Studio } from "./studio";

export const dynamic = "force-dynamic";

export default async function StudioPage({ params }: { params: Promise<{ filmId: string }> }) {
  const { filmId } = await params;
  if (!UUID_RE.test(filmId)) notFound();
  const { db, child } = await requirePageOwner();
  const film = await getOwnedFilm(db, child.id, filmId).catch(() => null);
  if (!film || film.source !== "slideshow") notFound();
  const data = await filmData(db, child, film);
  const overrides = await db.select().from(schema.filmScenes).where(eq(schema.filmScenes.filmId, film.id));
  const omitted = overrides.filter((o) => o.omitted && o.mediaId);
  const omittedMedia = omitted.length
    ? await db
        .select({ id: schema.media.id, caption: schema.media.caption })
        .from(schema.media)
        .where(and(eq(schema.media.childId, child.id), isNull(schema.media.deletedAt)))
    : [];
  const omittedIds = new Set(omitted.map((o) => o.mediaId!));
  return (
    <div className="space-y-6 py-8">
      <header>
        <Link href="/app/birthday/5" className="text-sm text-slate hover:underline">← Birthday</Link>
        <h1 className="font-display mt-2 text-4xl sm:text-5xl">Film studio</h1>
        <p className="mt-1 max-w-2xl text-slate">
          Pin must-include photos, leave out blurry ones, and write the words that appear on screen. Changes return the film to draft; render a new MP4
          after approving.
        </p>
      </header>
      <Studio
        filmId={film.id}
        title={film.title}
        opening={film.openingTitle ?? []}
        closing={film.closingTitle ?? []}
        duration={film.durationTargetSeconds}
        status={film.status}
        scenes={data.plan.scenes.flatMap((s) =>
          s.type === "photo"
            ? [{ mediaId: s.mediaId, caption: s.caption, chapterKey: s.chapterKey, duration: s.duration, pinned: !!overrides.find((o) => o.mediaId === s.mediaId)?.pinned }]
            : [],
        )}
        omitted={omittedMedia.filter((m) => omittedIds.has(m.id))}
      />
    </div>
  );
}
