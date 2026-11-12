import Link from "next/link";
import { notFound } from "next/navigation";
import { and, eq } from "drizzle-orm";
import { requirePageOwner } from "@/server/access";
import { schema } from "@/server/db";
import { ensureDefaultAlbums } from "@/server/films";
import { UUID_RE } from "@/server/http";
import { neighbours, publicMedia } from "@/server/media/queries";
import { ageLabel, formatDate } from "@/lib/dates";
import { mediaUrl } from "@/components/media-thumb";
import { MemoryEditor } from "./memory-editor";

export const dynamic = "force-dynamic";

export default async function MemoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const { db, child } = await requirePageOwner();
  const m = (
    await db
      .select()
      .from(schema.media)
      .where(and(eq(schema.media.id, id), eq(schema.media.childId, child.id)))
      .limit(1)
  )[0];
  if (!m) notFound();
  await ensureDefaultAlbums(db, child.id);
  const [albums, memberships, nb] = await Promise.all([
    db.select({ id: schema.albums.id, name: schema.albums.name }).from(schema.albums).where(eq(schema.albums.childId, child.id)),
    db.select({ albumId: schema.albumMedia.albumId }).from(schema.albumMedia).where(eq(schema.albumMedia.mediaId, m.id)),
    neighbours(db, child.id, m),
  ]);
  const tz = child.timezone;
  const pm = publicMedia(m);

  return (
    <div className="grid gap-8 py-6 lg:grid-cols-[1fr_360px]">
      <div className="space-y-3">
        <div className="flex items-center justify-between text-sm">
          <Link href="/app/library" className="text-slate hover:underline">← Library</Link>
          <span className="flex gap-2">
            {nb.prev && <Link className="btn btn-ghost !min-h-9 !px-3" href={`/app/memories/${nb.prev}`} aria-label="Previous memory">←</Link>}
            {nb.next && <Link className="btn btn-ghost !min-h-9 !px-3" href={`/app/memories/${nb.next}`} aria-label="Next memory">→</Link>}
          </span>
        </div>
        <figure className="overflow-hidden rounded-2xl bg-midnight">
          {m.kind === "video" ? (
            <video
              controls
              playsInline
              preload="metadata"
              poster={mediaUrl(m.id, "poster")}
              src={mediaUrl(m.id, "playback")}
              className="max-h-[78dvh] w-full"
            />
          ) : m.status === "processing" ? (
            <div className="flex aspect-[4/3] items-center justify-center text-slate-light">Preparing preview…</div>
          ) : m.status === "preview_unavailable" || m.status === "failed" ? (
            <div className="flex aspect-[4/3] flex-col items-center justify-center gap-2 p-6 text-center text-slate-light">
              <p>The original is saved safely, but a preview couldn’t be made for this format.</p>
              <a className="btn btn-gold" href={`/api/media/${m.id}/access?download=1`}>Download original</a>
            </div>
          ) : (
            <img src={mediaUrl(m.id, "display")} alt={m.caption ?? ""} className="mx-auto max-h-[78dvh] w-auto object-contain" />
          )}
          {m.caption && <figcaption className="font-display px-5 py-4 text-xl text-ivory">{m.caption}</figcaption>}
        </figure>
        <p className="text-sm text-slate">
          {m.capturedAt ? (
            <>
              {formatDate(m.capturedAt, tz)} · {ageLabel(child.birthDate, m.capturedAt, tz)}
              {m.dateNeedsReview && " · date not yet confirmed"}
            </>
          ) : (
            "Date unknown"
          )}
        </p>
      </div>
      <MemoryEditor
        media={pm}
        albums={albums.map((a) => ({ ...a, member: memberships.some((x) => x.albumId === a.id) }))}
        isCover={child.coverMediaId === m.id}
        timeZone={tz}
      />
    </div>
  );
}
