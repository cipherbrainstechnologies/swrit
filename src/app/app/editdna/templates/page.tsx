import Link from "next/link";
import { requirePageOwner } from "@/server/access";
import { listEditdnaTemplates } from "@/server/editdna";
import { TemplatesDesk, type TemplateRow } from "./templates-desk";

export const dynamic = "force-dynamic";

export default async function EditdnaTemplatesPage() {
  const { db, child } = await requirePageOwner();
  const rows = await listEditdnaTemplates(db, child.id, 120);
  const initial: TemplateRow[] = rows.map((row) => ({
    id: row.id,
    name: row.name,
    sourceLabel: row.sourceLabel,
    createdAt: row.createdAt.toISOString(),
    manifest: row.manifest,
  }));

  return (
    <div className="space-y-8 py-8">
      <Link href="/app/editdna" className="text-sm text-gold-deep hover:underline">
        ← EditDNA
      </Link>
      <header>
        <p className="eyebrow text-slate">Style templates</p>
        <h1 className="font-display mt-2 text-4xl">Editing DNA vault</h1>
        <p className="mt-2 max-w-2xl text-slate">
          Versioned JSON artifacts: pacing, transitions, caption style, and music sync extracted from reference edits.
          Share, edit by hand, and feed them into <code className="text-sm">editdna apply</code>.
        </p>
      </header>
      <TemplatesDesk initial={initial} />
    </div>
  );
}