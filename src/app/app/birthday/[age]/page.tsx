import Link from "next/link";
import { notFound } from "next/navigation";
import { and, desc, eq, isNull } from "drizzle-orm";
import { requirePageOwner } from "@/server/access";
import { schema } from "@/server/db";
import { env } from "@/server/env";
import { ensureBirthdayFilm, ensureDefaultAlbums, filmData, FIVE_YEARS_ALBUM, ordinal } from "@/server/films";
import { birthdayState } from "@/lib/dates";
import { mediaUrl } from "@/components/media-thumb";
import { MusicPanel } from "./music-panel";
import { RenderPanel } from "./render-panel";

export const dynamic = "force-dynamic";

export default async function BirthdayPage({ params }: { params: Promise<{ age: string }> }) {
  const age = Number((await params).age);
  if (!Number.isInteger(age) || age < 1 || age > 30) notFound();
  const { db, child } = await requirePageOwner();
  await ensureDefaultAlbums(db, child.id);
  const film = await ensureBirthdayFilm(db, child, age);
  const data = await filmData(db, child, film);
  const state = birthdayState(child.birthDate, new Date(), child.timezone);
  const [legacy, audioFiles, fiveAlbum] = await Promise.all([
    db
      .select()
      .from(schema.birthdayFilms)
      .where(and(eq(schema.birthdayFilms.childId, child.id), eq(schema.birthdayFilms.source, "imported")))
      .orderBy(desc(schema.birthdayFilms.createdAt)),
    db
      .select()
      .from(schema.media)
      .where(and(eq(schema.media.childId, child.id), eq(schema.media.kind, "audio"), isNull(schema.media.deletedAt)))
      .orderBy(desc(schema.media.createdAt)),
    db
      .select()
      .from(schema.albums)
      .where(and(eq(schema.albums.childId, child.id), eq(schema.albums.name, FIVE_YEARS_ALBUM)))
      .limit(1),
  ]);
  const photos = data.plan.scenes.filter((s) => s.type === "photo");
  const mins = Math.floor(data.plan.totalSeconds / 60);
  const secs = Math.round(data.plan.totalSeconds % 60);

  return (
    <div className="space-y-10 py-8">
      <section className="-mx-4 overflow-hidden bg-midnight px-6 py-12 text-ivory sm:-mx-6 sm:rounded-b-3xl sm:px-10">
        <p className="eyebrow text-gold">
          {state.kind === "today" && state.age === age ? "Today!" : `13 November ${new Date(`${child.birthDate}T00:00:00Z`).getUTCFullYear() + age}`}
        </p>
        <h1 className="font-display mt-3 text-5xl sm:text-7xl">Happy {ordinal(age)} Birthday</h1>
        <p className="mt-3 max-w-xl text-ivory/80">
          {photos.length} photos across {data.plan.scenes.filter((s) => s.type === "chapter").length} chapters · {mins} min {secs} s
          {data.plan.skippedUndated > 0 && ` · ${data.plan.skippedUndated} photos left out until their dates are confirmed`}
        </p>
        <div className="mt-8 flex flex-wrap gap-3">
          <Link href={`/theatre/${film.id}`} className="btn btn-gold !min-h-14 !px-8 text-lg" data-testid="play-birthday">
            ▶ Play {child.preferredName}’s {ordinal(age)} Birthday
          </Link>
          <Link href={`/app/studio/${film.id}`} className="btn btn-ghost text-ivory">Edit the film</Link>
        </div>
        {photos.length > 0 && (
          <div className="mt-8 flex gap-2 overflow-x-auto pb-2">
            {photos.slice(0, 16).map((p) => (
              <img key={p.mediaId} src={mediaUrl(p.mediaId, "thumb")} alt="" className="h-20 w-20 shrink-0 rounded-lg object-cover opacity-90" loading="lazy" />
            ))}
          </div>
        )}
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <div className="card space-y-3 p-6">
          <h2 className="font-display text-2xl">Choose the must-have photos</h2>
          <p className="text-sm text-slate">
            Photos in the album <strong>{FIVE_YEARS_ALBUM}</strong> are always included. Favourites are preferred and stay on screen a little
            longer. Everything else is sampled evenly across his five years.
          </p>
          <div className="flex flex-wrap gap-2">
            {fiveAlbum[0] && <Link className="btn btn-dark" href={`/app/albums/${fiveAlbum[0].id}`}>Open the album</Link>}
            <Link className="btn btn-ghost" href="/app/library">Pick from the library</Link>
          </div>
        </div>
        <MusicPanel
          filmId={film.id}
          current={data.audio}
          files={audioFiles.map((a) => ({ id: a.id, name: a.filenameOriginal, durationMs: a.durationMs, status: a.status }))}
        />
      </section>

      <RenderPanel filmId={film.id} enabled={env().ENABLE_VIDEO_RENDER} />

      <section className="space-y-4">
        <h2 className="font-display text-3xl">Past films</h2>
        {legacy.length === 0 ? (
          <p className="text-sm text-slate">
            No earlier films yet. You can add the birthday MP4s you already made on the <Link className="underline" href="/app/upload">upload page</Link>.
          </p>
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {legacy.map((f) => (
              <li key={f.id} className="card overflow-hidden">
                <div className="aspect-video bg-midnight">
                  {f.sourceMediaId && <img src={mediaUrl(f.sourceMediaId, "poster")} alt="" className="h-full w-full object-cover" loading="lazy" />}
                </div>
                <div className="space-y-2 p-4">
                  <p className="font-display text-xl">{f.title}</p>
                  <div className="flex gap-2">
                    <Link className="btn btn-dark !min-h-9 text-sm" href={`/theatre/${f.id}`}>▶ Play</Link>
                    <a className="btn btn-ghost !min-h-9 text-sm" href={`/api/films/${f.id}/playback?download=1`}>Download</a>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
