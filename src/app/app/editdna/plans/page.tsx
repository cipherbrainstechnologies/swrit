import Link from "next/link";
import { requirePageOwner } from "@/server/access";
import { listEditdnaPlans } from "@/server/editdna";
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
      <Link href="/app/editdna" className="text-sm text-gold-deep hover:underline">
        ← EditDNA
      </Link>
      <header>
        <p className="eyebrow text-slate">Edit plans</p>
        <h1 className="font-display mt-2 text-4xl">EDL vault</h1>
        <p className="mt-2 max-w-2xl text-slate">
          Intermediate edit decision lists for DaVinci Resolve. Download JSON and run{" "}
          <code className="text-sm">editdna build plan.json --execute</code> on a machine with Resolve scripting enabled.
        </p>
      </header>
      <PlansDesk initial={initial} />
    </div>
  );
}