import Link from "next/link";
import { asc, eq, sql } from "drizzle-orm";
import { requirePageOwner } from "@/server/access";
import { schema } from "@/server/db";
import { ensureDefaultAlbums } from "@/server/films";
import { mediaUrl } from "@/components/media-thumb";
import { NewAlbum } from "./new-album";

export const dynamic = "force-dynamic";

export default async function Albums() {
  const { db, child } = await requirePageOwner();
  await ensureDefaultAlbums(db, child.id);
  const albums = await db
    .select({
      id: schema.albums.id,
      name: schema.albums.name,
      description: schema.albums.description,
      coverMediaId: schema.albums.coverMediaId,
      count: sql<number>`(select count(*)::int from album_media am join media m on m.id = am.media_id where am.album_id = ${schema.albums.id} and m.deleted_at is null)`,
    })
    .from(schema.albums)
    .where(eq(schema.albums.childId, child.id))
    .orderBy(asc(schema.albums.createdAt));
  return (
    <div className="space-y-6 py-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow text-slate">Collections</p>
          <h1 className="font-display mt-2 text-4xl sm:text-5xl">Albums</h1>
        </div>
        <NewAlbum />
      </header>
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {albums.map((a) => (
          <li key={a.id}>
            <Link href={`/app/albums/${a.id}`} className="card block overflow-hidden transition hover:border-gold">
              <div className="aspect-[16/10] bg-ivory-2">
                {a.coverMediaId && Number(a.count) > 0 && <img src={mediaUrl(a.coverMediaId, "thumb")} alt="" className="h-full w-full object-cover" />}
              </div>
              <div className="p-4">
                <p className="font-display text-2xl">{a.name}</p>
                <p className="text-sm text-slate">{Number(a.count)} memories</p>
                {a.description && <p className="mt-1 text-xs text-slate">{a.description}</p>}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
