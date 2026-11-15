import Link from "next/link";
import type { ReactNode } from "react";

const CLI_REPO = "https://github.com/MEX-creator/easy-edit";

type FlowProps = {
  templateCount: number;
  planCount: number;
};

function ArrowDown({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden className={`mx-auto block text-gold-deep ${className}`} width="24" height="28" viewBox="0 0 24 28" fill="none">
      <path d="M12 0v20M12 20l-6-6M12 20l6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function ArrowRight() {
  return (
    <svg aria-hidden className="text-gold-deep" width="32" height="24" viewBox="0 0 32 24" fill="none">
      <path d="M0 12h22M22 12l-6-6M22 12l-6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function ArrowUp({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden className={`mx-auto block text-gold-deep ${className}`} width="24" height="28" viewBox="0 0 24 28" fill="none">
      <path d="M12 28V8M12 8l-6 6M12 8l6 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

function InputBox({ title, lines }: { title: string; lines: string[] }) {
  return (
    <div className="rounded-xl border border-midnight/15 bg-white px-4 py-3 text-center shadow-sm">
      <p className="text-sm font-medium leading-snug text-ink">{title}</p>
      {lines.map((line) => (
        <p key={line} className="mt-0.5 text-xs text-slate">
          {line}
        </p>
      ))}
    </div>
  );
}

function StageBox({
  title,
  subtitle,
  bullets,
  href,
  cta,
}: {
  title: string;
  subtitle?: string;
  bullets: string[];
  href?: string;
  cta?: string;
}) {
  const body = (
    <div
      className={`h-full rounded-xl border border-midnight/20 bg-midnight px-4 py-4 text-ivory shadow-md ${href ? "transition hover:border-gold/60 hover:shadow-lg" : ""}`}
    >
      <p className="font-mono text-sm font-semibold tracking-wide">{title}</p>
      {subtitle ? <p className="mt-1 font-mono text-xs text-gold/90">{subtitle}</p> : null}
      <ul className="mt-3 space-y-1 text-left text-xs leading-relaxed text-slate-light">
        {bullets.map((b) => (
          <li key={b} className="flex gap-2">
            <span className="text-gold">•</span>
            <span>{b}</span>
          </li>
        ))}
      </ul>
      {cta && href ? <p className="mt-3 text-xs font-medium text-gold">{cta} →</p> : null}
    </div>
  );
  return href ? (
    <Link href={href} className="block h-full">
      {body}
    </Link>
  ) : (
    body
  );
}

function ArtifactBox({
  title,
  subtitle,
  detail,
  href,
  count,
}: {
  title: string;
  subtitle: string;
  detail: string;
  href: string;
  count: number;
}) {
  return (
    <Link
      href={href}
      className="group block h-full rounded-xl border-2 border-gold/40 bg-ivory-2 px-4 py-4 text-center shadow-sm transition hover:border-gold hover:shadow-md"
    >
      <p className="font-display text-lg text-ink">{title}</p>
      <p className="mt-1 text-xs text-slate">{subtitle}</p>
      <p className="mt-2 text-xs text-slate-light">{detail}</p>
      <p className="mt-3 text-sm font-medium text-gold-deep group-hover:underline">
        Open vault{count > 0 ? ` · ${count} saved` : ""}
      </p>
    </Link>
  );
}

function Column({ children }: { children: ReactNode }) {
  return <div className="flex flex-col items-stretch gap-2">{children}</div>;
}

/** Layout matches the EditDNA README “How it works” ASCII diagram (3 columns). */
export function EditdnaPipelineFlow({ templateCount, planCount }: FlowProps) {
  return (
    <section className="card overflow-hidden p-4 sm:p-8" aria-labelledby="editdna-flow-title">
      <h2 id="editdna-flow-title" className="font-display text-2xl text-ink sm:text-3xl">
        How it works
      </h2>
      <p className="mt-2 max-w-2xl text-sm text-slate">
        Reference on the left, your footage in the center, Resolve on the right. Templates and EDL vaults sit on the arrows
        between analyzer, applier, and the driver.
      </p>

      <div className="mt-8 hidden gap-4 lg:grid lg:grid-cols-3">
        {/* Column 1 — reference → analyzer → template */}
        <Column>
          <InputBox title="Reference video" lines={["(viral Reel / short)"]} />
          <ArrowDown />
          <StageBox
            title="analyzer/"
            subtitle="analyze_style()"
            bullets={[
              "PySceneDetect cuts",
              "transition classify",
              "OCR text/captions",
              "librosa beats/energy",
            ]}
            href="/app/editdna/templates"
            cta="Import template JSON"
          />
          <ArrowDown />
          <ArtifactBox
            title="StyleTemplate (JSON)"
            subtitle="the reusable artifact"
            detail="editdna analyze"
            href="/app/editdna/templates"
            count={templateCount}
          />
        </Column>

        {/* Column 2 — clips → applier → EDL + horizontal arrows */}
        <Column>
          <InputBox title="Your raw clips + script" lines={["(+ optional music)"]} />
          <ArrowDown />
          <StageBox
            title="applier/"
            subtitle="plan_edit()"
            bullets={[
              "template pacing + beat grid (determin.)",
              "LLM judgment calls",
              "(or heuristic planner)",
            ]}
            href="/app/editdna/plans"
            cta="Import EDL JSON"
          />
          <ArrowDown />
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <ArtifactBox
                title="EDL (JSON)"
                subtitle="edit plan"
                detail="editdna apply"
                href="/app/editdna/plans"
                count={planCount}
              />
            </div>
            <ArrowRight />
            <div className="flex-1 rounded-xl border border-dashed border-midnight/25 bg-white px-3 py-4 text-center">
              <p className="font-mono text-xs font-medium text-ink">resolve_driver/</p>
              <p className="font-mono text-[10px] text-slate">resolve_bridge.py</p>
            </div>
          </div>
        </Column>

        {/* Column 3 — Resolve (top) ← EDL */}
        <Column>
          <InputBox title="DaVinci Resolve" lines={["(Free)"]} />
          <ArrowUp className="opacity-90" />
          <div className="flex-1 rounded-xl border border-midnight/15 bg-gradient-to-b from-midnight-2 to-midnight px-4 py-6 text-center text-ivory shadow-sm">
            <p className="text-sm font-medium">Timeline assembled in Resolve</p>
            <p className="mt-2 text-xs leading-relaxed text-slate-light">
              Trims, transitions, Text+, music — then you polish and export.
            </p>
            <p className="mt-4 font-mono text-xs text-gold">
              editdna build plan.json --execute
            </p>
            <a className="mt-4 inline-block text-xs text-gold-deep underline-offset-2 hover:underline" href={CLI_REPO} rel="noreferrer" target="_blank">
              Run via EditDNA CLI
            </a>
          </div>
        </Column>
      </div>

      {/* Connector row: template → EDL (README horizontal flow) */}
      <div className="mt-2 hidden items-center justify-center gap-3 text-xs text-slate lg:flex">
        <span className="rounded-full bg-ivory-2 px-3 py-1">StyleTemplate (JSON)</span>
        <ArrowRight />
        <span className="rounded-full bg-ivory-2 px-3 py-1">EDL (JSON)</span>
        <ArrowRight />
        <span className="rounded-full bg-ivory-2 px-3 py-1">resolve_driver/</span>
      </div>

      {/* Mobile: single-column, top-to-bottom same semantics */}
      <ol className="mt-8 space-y-8 lg:hidden">
        <li className="space-y-2">
          <p className="eyebrow text-slate">Left column</p>
          <InputBox title="Reference video" lines={["(viral Reel / short)"]} />
          <ArrowDown />
          <StageBox
            title="analyzer/"
            subtitle="analyze_style()"
            bullets={["PySceneDetect cuts", "transition classify", "OCR text/captions", "librosa beats/energy"]}
            href="/app/editdna/templates"
            cta="Vault"
          />
          <ArrowDown />
          <ArtifactBox
            title="StyleTemplate (JSON)"
            subtitle="the reusable artifact"
            detail="editdna analyze"
            href="/app/editdna/templates"
            count={templateCount}
          />
        </li>
        <li className="space-y-2">
          <p className="eyebrow text-slate">Center column</p>
          <InputBox title="Your raw clips + script" lines={["(+ optional music)"]} />
          <ArrowDown />
          <StageBox
            title="applier/"
            subtitle="plan_edit()"
            bullets={["template pacing + beat grid", "LLM or heuristic planner"]}
            href="/app/editdna/plans"
            cta="Vault"
          />
          <ArrowDown />
          <ArtifactBox
            title="EDL (JSON)"
            subtitle="edit plan"
            detail="editdna apply"
            href="/app/editdna/plans"
            count={planCount}
          />
          <div className="flex justify-center py-1">
            <ArrowRight />
          </div>
          <div className="rounded-xl border border-dashed border-midnight/25 bg-white px-4 py-3 text-center font-mono text-xs text-ink">
            resolve_driver/ · resolve_bridge.py
          </div>
        </li>
        <li className="space-y-2">
          <p className="eyebrow text-slate">Right column</p>
          <ArrowUp />
          <InputBox title="DaVinci Resolve" lines={["(Free)"]} />
        </li>
      </ol>

      <div className="mt-6 flex flex-wrap gap-2 border-t border-ivory-2 pt-6 text-sm">
        <Link href="/app/library" className="btn btn-ghost !min-h-9">
          Pick clips from library
        </Link>
        <Link href="/app/upload" className="btn btn-ghost !min-h-9">
          Upload reference / footage
        </Link>
        <a className="btn btn-ghost !min-h-9" href={CLI_REPO} rel="noreferrer" target="_blank">
          EditDNA CLI repo
        </a>
      </div>
    </section>
  );
}