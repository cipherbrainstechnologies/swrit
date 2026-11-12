import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { requirePageOwner } from "@/server/access";
import { schema } from "@/server/db";
import { listMedia, yearsWithMedia } from "@/server/media/queries";
import { ensureDefaultAlbums } from "@/server/films";
import { SelectableGrid } from "@/components/selectable-grid";

export const dynamic = "force-dynamic";

type SP = Promise<Record<string, string | undefined>>;

export default async function Library({ searchParams }: { searchParams: SP }) {
  const sp = await searchParams;
  const { db, child } = await requirePageOwner();
  const year = sp.year ? Number(sp.year) : undefined;
  const kind = sp.kind === "image" || sp.kind === "video" ? sp.kind : undefined;
  const page = Math.max(0, Number(sp.page ?? 0) || 0);
  const pageSize = 120;
  await ensureDefaultAlbums(db, child.id);
  const [list, years, albums] = await Promise.all([
    listMedia(db, child.id, {
      year: Number.isFinite(year) ? year : undefined,
      kind,
      favorite: sp.favorite === "1",
      review: sp.review === "1",
      trash: sp.trash === "1",
      albumId: sp.album,
      order: sp.order === "recent" ? "recent" : "captured",
      cursor: String(page * pageSize),
      limit: pageSize,
      timeZone: child.timezone,
    }),
    yearsWithMedia(db, child.id, child.timezone),
    db.select({ id: schema.albums.id, name: schema.albums.name }).from(schema.albums).where(eq(schema.albums.childId, child.id)).orderBy(asc(schema.albums.createdAt)),
  ]);

  const link = (patch: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...sp, page: undefined, ...patch })) if (v) p.set(k, v);
    const s = p.toString();
    return `/app/library${s ? `?${s}` : ""}`;
  };
  const chip = (active: boolean) =>
    `whitespace-nowrap rounded-full border px-3 py-1.5 text-sm transition ${active ? "border-midnight bg-midnight text-ivory" : "border-ivory-2 bg-white/60 hover:border-gold"}`;

  return (
    <div className="space-y-6 py-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow text-slate">Memory Vault</p>
          <h1 className="font-display mt-2 text-4xl sm:text-5xl">{sp.trash === "1" ? "Trash" : "Library"}</h1>
        </div>
        <Link href="/app/upload" className="btn btn-dark">Add memories</Link>
      </header>

      <nav aria-label="Filters" className="flex gap-2 overflow-x-auto pb-1">
        <Link className={chip(!sp.kind && !sp.favorite && !sp.review && !sp.year && !sp.trash && !sp.album)} href="/app/library">All</Link>
        <Link className={chip(sp.kind === "image")} href={link({ kind: sp.kind === "image" ? undefined : "image" })}>Photos</Link>
        <Link className={chip(sp.kind === "video")} href={link({ kind: sp.kind === "video" ? undefined : "video" })}>Videos</Link>
        <Link className={chip(sp.favorite === "1")} href={link({ favorite: sp.favorite === "1" ? undefined : "1" })}>★ Favourites</Link>
        <Link className={chip(sp.review === "1")} href={link({ review: sp.review === "1" ? undefined : "1" })}>Dates to check</Link>
        <Link className={chip(sp.order === "recent")} href={link({ order: sp.order === "recent" ? undefined : "recent" })}>Recently added</Link>
        {years.map((y) => (
          <Link key={y.year} className={chip(year === y.year)} href={link({ year: year === y.year ? undefined : String(y.year) })}>
            {y.year}
          </Link>
        ))}
        <Link className={chip(sp.trash === "1")} href={link({ trash: sp.trash === "1" ? undefined : "1" })}>Trash</Link>
      </nav>

      {list.items.length === 0 ? (
        <div className="card p-10 text-center text-slate">
          {sp.trash === "1" ? "Trash is empty." : "No memories match this view yet."}
        </div>
      ) : (
        <SelectableGrid
          items={list.items.map((m) => ({
            id: m.id,
            kind: m.kind,
            status: m.status,
            favorite: m.favorite,
            dateNeedsReview: m.dateNeedsReview,
            durationMs: m.durationMs,
            caption: m.caption,
          }))}
          albums={albums}
          trash={sp.trash === "1"}
        />
      )}

      <div className="flex justify-between">
        {page > 0 ? <Link className="btn btn-ghost" href={link({ page: String(page - 1) })}>← Previous</Link> : <span />}
        {list.nextCursor ? <Link className="btn btn-ghost" href={link({ page: String(page + 1) })}>More →</Link> : <span />}
      </div>
    </div>
  );
}
