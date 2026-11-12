import Link from "next/link";
import { and, desc, eq, isNull } from "drizzle-orm";
import { requirePageOwner } from "@/server/access";
import { schema } from "@/server/db";
import { ensureBirthdayFilm } from "@/server/films";
import { mediaCounts, yearsWithMedia } from "@/server/media/queries";
import { ageAt, birthdayState, formatDate } from "@/lib/dates";
import { MediaThumb, mediaUrl } from "@/components/media-thumb";

export const dynamic = "force-dynamic";

export default async function Home() {
  const { db, child } = await requirePageOwner();
  const now = new Date();
  const tz = child.timezone;
  const state = birthdayState(child.birthDate, now, tz);
  const [counts, years, favourites] = await Promise.all([
    mediaCounts(db, child.id),
    yearsWithMedia(db, child.id, tz),
    db
      .select()
      .from(schema.media)
      .where(and(eq(schema.media.childId, child.id), isNull(schema.media.deletedAt), eq(schema.media.favorite, true)))
      .orderBy(desc(schema.media.capturedAt))
      .limit(12),
  ]);
  const film = await ensureBirthdayFilm(db, child, 5);
  const age = ageAt(child.birthDate, now, tz);
  const cover = child.coverMediaId ?? favourites[0]?.id ?? null;

  return (
    <div className="-mx-4 sm:-mx-6">
      {/* Hero */}
      <section className="relative isolate overflow-hidden bg-midnight text-ivory">
        {cover ? (
          <img
            src={mediaUrl(cover, "display")}
            alt=""
            className="slow-zoom absolute inset-0 -z-10 h-full w-full object-cover opacity-55"
          />
        ) : null}
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-midnight via-midnight/60 to-midnight/20" />
        <div className="mx-auto flex min-h-[72dvh] max-w-6xl flex-col justify-end px-5 pt-24 pb-12 sm:px-8">
          <p className="eyebrow text-gold fade-in">
            {state.kind === "today" ? `Today he turns ${state.age}` : `${state.days} day${state.days === 1 ? "" : "s"} until he turns ${state.age}`}
          </p>
          <h1 className="font-display mt-3 text-5xl leading-[1.05] font-medium sm:text-7xl fade-in">Dear {child.preferredName}</h1>
          <p className="mt-4 max-w-xl text-lg text-ivory/85 fade-in">
            {state.kind === "today" ? "Happy birthday, our little one. " : ""}
            {Math.max(age, 0) >= 5 || state.age === 5 ? "Five years of memories. A lifetime of love." : "Every moment. Every milestone. Forever yours."}
          </p>
          <div className="mt-8 flex flex-wrap gap-3 fade-in">
            <Link href="/app/upload" className="btn btn-gold">Add Memories</Link>
            <Link href="/app/timeline" className="btn btn-ghost text-ivory">Explore His Story</Link>
            <Link href={`/theatre/${film.id}`} className="btn btn-ghost text-ivory">▶ Play Birthday Film</Link>
          </div>
        </div>
      </section>

      <div className="mx-auto max-w-6xl space-y-10 px-4 py-10 sm:px-6">
        {!child.birthDateConfirmed && (
          <div className="card flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm">
              <strong>Please confirm his birth date.</strong> It is currently set to{" "}
              {formatDate(`${child.birthDate}T12:00:00+05:30`, tz)}, inferred from his fifth birthday. Ages and chapters use it.
            </p>
            <Link href="/app/settings" className="btn btn-dark shrink-0">Confirm date</Link>
          </div>
        )}

        {counts.total === 0 ? (
          <section className="card p-8 text-center">
            <h2 className="font-display text-3xl">His story starts here</h2>
            <p className="mx-auto mt-2 max-w-md text-slate">
              Nothing has been added yet. Upload photos and videos from your phone, or import a ZIP of the family archive.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Link href="/app/upload" className="btn btn-dark">Upload photos & videos</Link>
              <Link href="/app/upload#zip" className="btn btn-ghost">Import a ZIP</Link>
            </div>
          </section>
        ) : (
          <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {[
              { label: "Photos", value: counts.photos, href: "/app/library?kind=image" },
              { label: "Videos", value: counts.videos, href: "/app/library?kind=video" },
              { label: "Favourites", value: counts.favorites, href: "/app/library?favorite=1" },
              { label: "Dates to check", value: counts.review, href: "/app/review" },
            ].map((s) => (
              <Link key={s.label} href={s.href} className="card p-4 transition hover:border-gold">
                <div className="font-display text-4xl">{s.value}</div>
                <div className="eyebrow mt-1 text-slate">{s.label}</div>
              </Link>
            ))}
          </section>
        )}

        {counts.processing > 0 && (
          <p className="text-sm text-slate">Preparing previews for {counts.processing} new item{counts.processing === 1 ? "" : "s"}. Originals are already safe.</p>
        )}

        {years.length > 0 && (
          <section>
            <div className="flex items-baseline justify-between">
              <h2 className="font-display text-3xl">Year by year</h2>
              <Link href="/app/timeline" className="text-sm text-slate underline-offset-4 hover:underline">Full timeline</Link>
            </div>
            <div className="mt-4 flex gap-3 overflow-x-auto pb-2">
              {years.map((y) => (
                <Link key={y.year} href={`/app/years/${y.year}`} className="card min-w-36 p-4 transition hover:border-gold">
                  <div className="font-display text-3xl">{y.year}</div>
                  <div className="text-xs text-slate">{y.count} memories</div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {favourites.length > 0 && (
          <section>
            <h2 className="font-display text-3xl">Favourites</h2>
            <div className="mt-4 grid grid-cols-3 gap-2 sm:grid-cols-6">
              {favourites.map((m) => (
                <MediaThumb key={m.id} m={m} href={`/app/memories/${m.id}`} />
              ))}
            </div>
          </section>
        )}

        <section className="card overflow-hidden bg-midnight p-8 text-ivory">
          <p className="eyebrow text-gold">13 November</p>
          <h2 className="font-display mt-2 text-4xl">Birthday Theatre</h2>
          <p className="mt-2 max-w-lg text-ivory/80">
            A fullscreen film of his first five years, with your captions and a birthday finale. Plays on a phone, laptop or TV browser.
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href={`/theatre/${film.id}`} className="btn btn-gold">▶ Play Swritsinh’s 5th Birthday</Link>
            <Link href="/app/birthday/5" className="btn btn-ghost text-ivory">Prepare the film</Link>
          </div>
        </section>
      </div>
    </div>
  );
}
