import Link from "next/link";

const STEPS = [
  { href: "/app/editdna", label: "Pipeline", active: "hub" as const },
  { href: "/app/editdna/templates", label: "StyleTemplate", active: "template" as const },
  { href: "/app/editdna/plans", label: "EDL", active: "edl" as const },
] as const;

export function FlowStepNav({ step }: { step: (typeof STEPS)[number]["active"] }) {
  return (
    <nav aria-label="EditDNA pipeline steps" className="flex flex-wrap items-center gap-2 text-sm">
      {STEPS.map((s, i) => {
        const on = s.active === step;
        return (
          <span key={s.href} className="flex items-center gap-2">
            {i > 0 ? <span className="text-slate-light" aria-hidden>→</span> : null}
            {on ? (
              <span className="rounded-full bg-midnight px-3 py-1 text-ivory">{s.label}</span>
            ) : (
              <Link href={s.href} className="rounded-full border border-ivory-2 bg-white/60 px-3 py-1 text-slate hover:border-gold">
                {s.label}
              </Link>
            )}
          </span>
        );
      })}
    </nav>
  );
}