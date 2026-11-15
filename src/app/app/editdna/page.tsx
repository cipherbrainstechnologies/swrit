import Link from "next/link";
import { requirePageOwner } from "@/server/access";
import { listEditdnaPlans, listEditdnaTemplates } from "@/server/editdna";
import { EditdnaPipelineFlow } from "./editdna-pipeline-flow";
import { FlowStepNav } from "./flow-step-nav";

export const dynamic = "force-dynamic";

export default async function EditdnaHomePage() {
  const { db, child } = await requirePageOwner();
  const [templates, plans] = await Promise.all([
    listEditdnaTemplates(db, child.id, 80),
    listEditdnaPlans(db, child.id, 80),
  ]);

  return (
    <div className="space-y-10 py-8">
      <FlowStepNav step="hub" />
      <header className="max-w-3xl">
        <p className="eyebrow text-slate">EditDNA</p>
        <h1 className="font-display mt-2 text-4xl sm:text-5xl">Clone the edit, not the footage</h1>
        <p className="mt-3 text-slate">
          Follow the pipeline below: extract DNA from a reference, apply it to your clips, build in Resolve. The web vault holds{" "}
          <Link href="/app/editdna/templates" className="text-gold-deep hover:underline">
            StyleTemplate JSON
          </Link>{" "}
          and{" "}
          <Link href="/app/editdna/plans" className="text-gold-deep hover:underline">
            EDL JSON
          </Link>{" "}
          between the analyzer, applier, and Resolve driver.
        </p>
      </header>

      <EditdnaPipelineFlow templateCount={templates.length} planCount={plans.length} />

      {(templates.length > 0 || plans.length > 0) && (
        <section className="grid gap-6 md:grid-cols-2">
          {templates.length > 0 ? (
            <section>
              <div className="mb-3 flex items-end justify-between gap-2">
                <h2 className="font-display text-xl">StyleTemplate vault</h2>
                <Link href="/app/editdna/templates" className="text-sm text-gold-deep hover:underline">
                  All templates
                </Link>
              </div>
              <ul className="space-y-2">
                {templates.slice(0, 4).map((row) => (
                  <li key={row.id}>
                    <Link
                      href={`/app/editdna/templates/${row.id}`}
                      className="card flex items-center justify-between px-4 py-3 text-sm transition hover:border-gold"
                    >
                      <span className="text-ink">{row.name}</span>
                      <span className="text-xs text-slate">{row.sourceLabel ?? "imported"}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
          {plans.length > 0 ? (
            <section>
              <div className="mb-3 flex items-end justify-between gap-2">
                <h2 className="font-display text-xl">EDL vault</h2>
                <Link href="/app/editdna/plans" className="text-sm text-gold-deep hover:underline">
                  All edit plans
                </Link>
              </div>
              <ul className="space-y-2">
                {plans.slice(0, 4).map((row) => (
                  <li key={row.id}>
                    <Link href="/app/editdna/plans" className="card flex items-center justify-between px-4 py-3 text-sm transition hover:border-gold">
                      <span className="text-ink">{row.title}</span>
                      <span className="text-xs text-slate">EDL v1</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ) : null}
        </section>
      )}
    </div>
  );
}