import { requirePageOwner } from "@/server/access";
import { listMedia } from "@/server/media/queries";
import { ReviewList } from "./review-list";

export const dynamic = "force-dynamic";

export default async function Review() {
  const { db, child } = await requirePageOwner();
  const { items } = await listMedia(db, child.id, { review: true, limit: 200, timeZone: child.timezone });
  return (
    <div className="space-y-6 py-8">
      <header>
        <p className="eyebrow text-slate">Date review</p>
        <h1 className="font-display mt-2 text-4xl sm:text-5xl">Help me place these memories</h1>
        <p className="mt-2 max-w-2xl text-slate">
          These photos have no date, or a date that looks wrong (for example a camera whose clock was never set). Pick the right day, or
          confirm the suggestion. Nothing is guessed silently.
        </p>
      </header>
      {items.length === 0 ? (
        <div className="card p-10 text-center text-slate">Every memory has a confirmed date. Wonderful.</div>
      ) : (
        <ReviewList
          timeZone={child.timezone}
          items={items.map((m) => ({
            id: m.id,
            kind: m.kind,
            status: m.status,
            favorite: m.favorite,
            dateNeedsReview: m.dateNeedsReview,
            durationMs: m.durationMs,
            filename: m.filenameOriginal,
            capturedAt: m.capturedAt?.toISOString() ?? null,
            capturedSource: m.capturedSource,
          }))}
        />
      )}
    </div>
  );
}
