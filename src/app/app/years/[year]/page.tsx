import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePageOwner } from "@/server/access";
import { listMedia } from "@/server/media/queries";
import { ageLabel } from "@/lib/dates";
import { MediaThumb } from "@/components/media-thumb";

export const dynamic = "force-dynamic";

export default async function YearPage({ params }: { params: Promise<{ year: string }> }) {
  const year = Number((await params).year);
  if (!Number.isInteger(year) || year < 1990 || year > 2100) notFound();
  const { db, child } = await requirePageOwner();
  const tz = child.timezone;
  const { items } = await listMedia(db, child.id, { year, limit: 200, timeZone: tz });
  const months = new Map<string, typeof items>();
  const fmt = new Intl.DateTimeFormat("en-IN", { timeZone: tz, month: "long" });
  for (const m of items) {
    const k = m.capturedAt ? fmt.format(m.capturedAt) : "Unknown";
    months.set(k, [...(months.get(k) ?? []), m]);
  }
  const favourites = items.filter((m) => m.favorite);

  return (
    <div className="space-y-8 py-8">
      <header>
        <Link href="/app/timeline" className="text-sm text-slate hover:underline">← His story</Link>
        <h1 className="font-display mt-2 text-5xl">{year}</h1>
        <p className="text-slate">{items.length} memories{favourites.length ? ` · ${favourites.length} favourites` : ""}</p>
      </header>
      {items.length === 0 && <div className="card p-10 text-center text-slate">Nothing from {year} yet.</div>}
      {[...months.entries()].map(([month, list]) => (
        <section key={month}>
          <h2 className="font-display text-2xl">
            {month}
            {list[0].capturedAt && <span className="ml-2 text-base text-slate">{ageLabel(child.birthDate, list[0].capturedAt, tz)}</span>}
          </h2>
          <ul className="mt-3 grid grid-cols-3 gap-1.5 sm:grid-cols-6">
            {list.map((m) => (
              <li key={m.id}>
                <MediaThumb m={m} href={`/app/memories/${m.id}`} label={m.caption ?? undefined} />
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
