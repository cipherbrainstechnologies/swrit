import Link from "next/link";
import { requirePageOwner } from "@/server/access";
import { listEditdnaPlans } from "@/server/editdna";
import { FlowStepNav } from "../flow-step-nav";
import { PlansDesk, type PlanRow } from "./plans-desk";

export const dynamic = "force-dynamic";

export default async function EditdnaPlansPage() {
  const { db, child } = await requirePageOwner();
  const rows = await listEditdnaPlans(db, child.id, 120);
  const initial: PlanRow[] = rows.map((row) => ({
    id: row.id,
    title: row.title,
    templateId: row.templateId,
    notes: row.notes,
    createdAt: row.createdAt.toISOString(),
    edl: row.edl,
  }));

  return (
    <div className="space-y-8 py-8">
      <FlowStepNav step="edl" />
      <header className="space-y-2">
        <p className="eyebrow text-slate">applier/ → plan_edit()</p>
        <h1 className="font-display text-4xl">EDL (JSON)</h1>
        <p className="max-w-2xl text-slate">
          Output of <strong className="font-normal text-ink">your raw clips + script</strong> fed through the template. Pass this
          file to <code className="text-sm">resolve_driver/resolve_bridge.py</code> via{" "}
          <code className="text-sm">editdna build … --execute</code> while Resolve (Free) is running.
        </p>
      </header>
      <PlansDesk initial={initial} />
    </div>
  );
}