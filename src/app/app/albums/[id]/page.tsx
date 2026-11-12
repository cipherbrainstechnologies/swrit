import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { requirePageOwner } from "@/server/access";
import { schema } from "@/server/db";
import { UUID_RE } from "@/server/http";
import { listMedia } from "@/server/media/queries";
import { SelectableGrid } from "@/components/selectable-grid";

export const dynamic = "force-dynamic";

export default async function AlbumPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const { db, child } = await requirePageOwner();
  const album = (
    await db.select().from(schema.albums).where(and(eq(schema.albums.id, id), eq(schema.albums.childId, child.id))).limit(1)
  )[0];
  if (!album) notFound();
  const { items } = await listMedia(db, child.id, { albumId: album.id, limit: 200, timeZone: child.timezone });
  return (
    <div className="space-y-6 py-8">
      <header>
        <Link href="/app/albums" className="text-sm text-slate hover:underline">← Albums</Link>
        <h1 className="font-display mt-2 text-4xl sm:text-5xl">{album.name}</h1>
        {album.description && <p className="mt-1 text-slate">{album.description}</p>}
      </header>
      {items.length === 0 ? (
        <div className="card p-10 text-center text-slate">
          This album is empty. Open the <Link className="underline" href="/app/library">Library</Link>, tap <em>Select</em>, choose photos and add
          them here.
        </div>
      ) : (
        <SelectableGrid
          albumId={album.id}
          albums={[]}
          items={items.map((m) => ({
            id: m.id,
            kind: m.kind,
            status: m.status,
            favorite: m.favorite,
            dateNeedsReview: m.dateNeedsReview,
            durationMs: m.durationMs,
            caption: m.caption,
          }))}
        />
      )}
    </div>
  );
}
