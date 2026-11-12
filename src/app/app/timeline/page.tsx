import Link from "next/link";
import { and, eq, inArray, isNotNull, isNull, sql } from "drizzle-orm";
import { requirePageOwner } from "@/server/access";
import { schema } from "@/server/db";
import { mediaCounts } from "@/server/media/queries";
import { ageInMonths, formatDate } from "@/lib/dates";
import { MediaThumb } from "@/components/media-thumb";

export const dynamic = "force-dynamic";

const BANDS = [
  { min: -1000, max: 0, title: "Before you arrived", sub: "" },
  { min: 0, max: 12, title: "Your first year", sub: "Birth to one" },
  { min: 12, max: 24, title: "One year old", sub: "" },
  { min: 24, max: 36, title: "Two years old", sub: "" },
  { min: 36, max: 48, title: "Three years old", sub: "" },
  { min: 48, max: 60, title: "Four years old", sub: "" },
  { min: 60, max: 72, title: "Five years old", sub: "" },
  { min: 72, max: 10000, title: "Growing up", sub: "" },
];

export default async function Timeline() {
  const { db, child } = await requirePageOwner();
  const tz = child.timezone;
  const rows = await db
    .select()
    .from(schema.media)
    .where(
      and(
        eq(schema.media.childId, child.id),
        isNull(schema.media.deletedAt),
        isNotNull(schema.media.capturedAt),
        eq(schema.media.dateNeedsReview, false),
        inArray(schema.media.kind, ["image", "video"]),
        eq(schema.media.isLegacyFilm, false),
      ),
    )
    .orderBy(sql`${schema.media.capturedAt} asc`);
  const counts = await mediaCounts(db, child.id);
  const groups = BANDS.map((b) => ({
    ...b,
    items: rows.filter((m) => {
      const mo = ageInMonths(child.birthDate, m.capturedAt!, tz);
      return mo >= b.min && mo < b.max;
    }),
  })).filter((g) => g.items.length);

  return (
    <div className="space-y-10 py-8">
      <header>
        <p className="eyebrow text-slate">His story</p>
        <h1 className="font-display mt-2 text-4xl sm:text-5xl">From the very beginning</h1>
        <p className="mt-2 text-slate">
          Born {formatDate(`${child.birthDate}T12:00:00+05:30`, tz)}
          {child.birthDateConfirmed ? "" : " (inferred, please confirm in Settings)"}. Ages are calculated in India time.
        </p>
      </header>

      {counts.review > 0 && (
        <Link href="/app/review" className="card flex items-center justify-between gap-4 p-5 transition hover:border-gold">
          <div>
            <p className="font-display text-2xl">Help me place these memories</p>
            <p className="text-sm text-slate">
              {counts.review} photo{counts.review === 1 ? "" : "s"} have a missing or doubtful date. They stay out of the timeline until you confirm.
            </p>
          </div>
          <span aria-hidden className="text-2xl">→</span>
        </Link>
      )}

      {groups.length === 0 && <div className="card p-10 text-center text-slate">No dated memories yet.</div>}

      <ol className="relative space-y-12 border-l border-gold/50 pl-6">
        {groups.map((g) => (
          <li key={g.title} className="relative">
            <span aria-hidden className="absolute top-2 -left-[31px] h-3 w-3 rounded-full bg-gold ring-4 ring-ivory" />
            <h2 className="font-display text-3xl">{g.title}</h2>
            <p className="text-sm text-slate">
              {formatDate(g.items[0].capturedAt!, tz, "short")} – {formatDate(g.items[g.items.length - 1].capturedAt!, tz, "short")} · {g.items.length} memories
            </p>
            <ul className="mt-4 grid grid-cols-3 gap-1.5 sm:grid-cols-6">
              {g.items.slice(0, 18).map((m) => (
                <li key={m.id}>
                  <MediaThumb m={m} href={`/app/memories/${m.id}`} label={m.caption ?? undefined} />
                </li>
              ))}
            </ul>
            {g.items.length > 18 && (
              <p className="mt-2 text-sm">
                <Link className="underline-offset-4 hover:underline" href={`/app/years/${new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric" }).format(g.items[0].capturedAt!)}`}>
                  See all from this time →
                </Link>
              </p>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
