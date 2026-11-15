import Link from "next/link";
import { requirePageOwner } from "@/server/access";
import { listEditdnaPlans, listEditdnaTemplates } from "@/server/editdna";

export const dynamic = "force-dynamic";

const CLI_REPO = "https://github.com/MEX-creator/easy-edit";

export default async function EditdnaHomePage() {
  const { db, child } = await requirePageOwner();
  const [templates, plans] = await Promise.all([
    listEditdnaTemplates(db, child.id, 5),
    listEditdnaPlans(db, child.id, 5),
  ]);

  return (
    <div className="space-y-10 py-8">
      <header className="max-w-3xl">
        <p className="eyebrow text-slate">EditDNA</p>
        <h1 className="font-display mt-2 text-4xl sm:text-5xl">Clone the edit, not the footage</h1>
        <p className="mt-3 text-slate">
          Extract pacing, transitions, captions, and beat-sync from a reference Reel or short, save it as a versioned JSON
          template, apply it to your clips, and build the timeline in DaVinci Resolve Free. Analysis runs locally in the{" "}
          <a className="text-gold-deep hover:underline" href={CLI_REPO} rel="noreferrer" target="_blank">
            EditDNA CLI
          </a>
          ; this vault stores templates and edit plans (EDLs) for your family archive.
        </p>
      </header>

      <section className="grid gap-4 lg:grid-cols-3">
        <div className="card space-y-3 p-6 lg:col-span-2">
          <h2 className="font-display text-2xl text-ink">Pipeline</h2>
          <ol className="space-y-3 text-sm text-slate">
            <li>
              <span className="font-medium text-ink">1. Analyze</span> —{" "}
              <code className="rounded bg-ivory-2 px-1.5 py-0.5 text-xs">editdna analyze reference.mp4</code> on your machine
              (PySceneDetect, transitions, OCR, librosa).
            </li>
            <li>
              <span className="font-medium text-ink">2. Vault</span> — import the template JSON here for preview, download, and delete.
            </li>
            <li>
              <span className="font-medium text-ink">3. Apply</span> —{" "}
              <code className="rounded bg-ivory-2 px-1.5 py-0.5 text-xs">editdna apply template.json clips…</code> produces an
              EDL; import that JSON under Edit plans.
            </li>
            <li>
              <span className="font-medium text-ink">4. Resolve</span> —{" "}
              <code className="rounded bg-ivory-2 px-1.5 py-0.5 text-xs">editdna build plan.json --execute</code> with Resolve
              open; polish and export.
            </li>
          </ol>
        </div>
        <aside className="card space-y-3 p-6">
          <h2 className="font-display text-xl text-ink">Quick links</h2>
          <div className="flex flex-col gap-2">
            <Link href="/app/editdna/templates" className="btn btn-gold">
              Style templates
            </Link>
            <Link href="/app/editdna/plans" className="btn btn-dark">
              Edit plans (EDL)
            </Link>
            <Link href="/app/ai-studio/reels" className="btn">
              Saved reels (MP4)
            </Link>
          </div>
        </aside>
      </section>

      <section className="grid gap-6 md:grid-cols-2">
        <div>
          <div className="mb-3 flex items-end justify-between gap-2">
            <h2 className="font-display text-2xl">Recent templates</h2>
            <Link href="/app/editdna/templates" className="text-sm text-gold-deep hover:underline">
              View all
            </Link>
          </div>
          {templates.length === 0 ? (
            <p className="text-sm text-slate">No templates yet. Import JSON or add the sample from the templates page.</p>
          ) : (
            <ul className="space-y-2">
              {templates.map((row) => (
                <li key={row.id}>
                  <Link
                    href={`/app/editdna/templates/${row.id}`}
                    className="card flex items-center justify-between px-4 py-3 transition hover:border-gold"
                  >
                    <span className="text-ink">{row.name}</span>
                    <span className="text-xs text-slate">{row.sourceLabel ?? "imported"}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <div className="mb-3 flex items-end justify-between gap-2">
            <h2 className="font-display text-2xl">Recent edit plans</h2>
            <Link href="/app/editdna/plans" className="text-sm text-gold-deep hover:underline">
              View all
            </Link>
          </div>
          {plans.length === 0 ? (
            <p className="text-sm text-slate">No EDLs yet. Import from EditDNA apply output.</p>
          ) : (
            <ul className="space-y-2">
              {plans.map((row) => (
                <li key={row.id}>
                  <Link href="/app/editdna/plans" className="card flex items-center justify-between px-4 py-3 transition hover:border-gold">
                    <span className="text-ink">{row.title}</span>
                    <span className="text-xs text-slate">EDL v1</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}