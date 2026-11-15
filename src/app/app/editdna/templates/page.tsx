import Link from "next/link";
import { requirePageOwner } from "@/server/access";
import { listEditdnaTemplates } from "@/server/editdna";
import { FlowStepNav } from "../flow-step-nav";
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
      <FlowStepNav step="template" />
      <header className="space-y-2">
        <p className="eyebrow text-slate">analyzer/ → analyze_style()</p>
        <h1 className="font-display text-4xl">StyleTemplate (JSON)</h1>
        <p className="max-w-2xl text-slate">
          Output of the <strong className="font-normal text-ink">reference video</strong> column: pacing, transitions, captions,
          and beat-sync. Import from <code className="text-sm">editdna analyze</code>, then hand into{" "}
          <code className="text-sm">editdna apply</code> on the center column.
        </p>
      </header>
      <TemplatesDesk initial={initial} />
    </div>
  );
}