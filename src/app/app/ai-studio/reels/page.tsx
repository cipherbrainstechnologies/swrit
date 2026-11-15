import Link from "next/link";
import { requirePageOwner } from "@/server/access";
import { listStudioExportVault } from "@/server/studio";
import { ReelsVault, type VaultItem } from "./reels-vault";

export const dynamic = "force-dynamic";

export default async function SavedReelsPage() {
  const { db, child } = await requirePageOwner();
  const rows = await listStudioExportVault(db, child.id, { limit: 120 });
  const initial: VaultItem[] = rows.map((row) => ({
    id: row.id,
    projectId: row.projectId,
    projectTitle: row.projectTitle,
    pipeline: row.pipeline,
    profile: row.profile,
    width: row.width,
    height: row.height,
    durationSeconds: row.durationSeconds,
    createdAt: row.createdAt.toISOString(),
  }));

  return (
    <div className="space-y-8 py-8">
      <Link href="/app/ai-studio" className="text-sm text-gold-deep hover:underline">
        ← AI Studio
      </Link>
      <header className="max-w-3xl">
        <p className="eyebrow text-slate">Export vault</p>
        <h1 className="font-display mt-2 text-4xl sm:text-5xl">Saved reels &amp; shorts</h1>
        <p className="mt-3 text-slate">
          Every finished vertical cut and social export lives here. Preview in place, download the MP4, or delete the file from private
          storage and remove its database row. Source photographs and videos in your library are never touched.
        </p>
      </header>
      <ReelsVault initial={initial} />
    </div>
  );
}