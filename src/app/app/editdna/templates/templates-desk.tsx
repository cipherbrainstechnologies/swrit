"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";

export type TemplateRow = {
  id: string;
  name: string;
  sourceLabel: string | null;
  createdAt: string;
  manifest: Record<string, unknown>;
};

function summarize(manifest: Record<string, unknown>) {
  const pacing = manifest.pacing as Record<string, unknown> | undefined;
  const parts: string[] = [];
  if (pacing?.avg_shot_duration_sec) parts.push(`${pacing.avg_shot_duration_sec}s avg shot`);
  if (pacing?.beat_synced) parts.push("beat-synced");
  const summary = typeof manifest.llm_style_summary === "string" ? manifest.llm_style_summary : "";
  return { parts, summary };
}

export function TemplatesDesk({ initial }: { initial: TemplateRow[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [importText, setImportText] = useState("");

  async function refresh() {
    const response = await fetch("/api/editdna/templates");
    if (!response.ok) return;
    const body = (await response.json()) as { items: TemplateRow[] };
    setItems(body.items);
  }

  async function seedSample() {
    setBusy("sample");
    setMessage("");
    const response = await fetch("/api/editdna/templates", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ seedSample: true }),
    });
    setBusy(null);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setMessage((body as { message?: string }).message ?? "Could not add sample.");
      return;
    }
    await refresh();
    router.refresh();
  }

  async function importJson() {
    setBusy("import");
    setMessage("");
    let manifest: unknown;
    try {
      manifest = JSON.parse(importText);
    } catch {
      setBusy(null);
      setMessage("Paste valid EditDNA template JSON (schema_version 1).");
      return;
    }
    const response = await fetch("/api/editdna/templates", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ manifest }),
    });
    setBusy(null);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setMessage((body as { message?: string }).message ?? "Import rejected.");
      return;
    }
    setImportText("");
    await refresh();
    router.refresh();
  }

  async function remove(id: string, name: string) {
    if (!window.confirm(`Delete template “${name}” from the database?`)) return;
    setBusy(id);
    const response = await fetch(`/api/editdna/templates/${id}`, { method: "DELETE" });
    setBusy(null);
    if (!response.ok) {
      setMessage("Delete failed.");
      return;
    }
    setItems((rows) => rows.filter((r) => r.id !== id));
  }

  function download(row: TemplateRow) {
    const blob = new Blob([JSON.stringify(row.manifest, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${row.name.replace(/[^a-z0-9_-]+/gi, "-") || "template"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-8">
      <section className="card space-y-4 p-6">
        <h2 className="font-display text-xl text-ink">Import template</h2>
        <p className="text-sm text-slate">Paste JSON from `editdna analyze` or hand-authored StyleTemplate v1.</p>
        <textarea
          className="field min-h-[140px] font-mono text-sm"
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
          placeholder='{"template_name":"my-reel","schema_version":1,...}'
        />
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-gold" disabled={!!busy} onClick={() => void importJson()}>
            {busy === "import" ? "Importing…" : "Import JSON"}
          </button>
          <button type="button" className="btn" disabled={!!busy} onClick={() => void seedSample()}>
            {busy === "sample" ? "Adding…" : "Add sample template"}
          </button>
        </div>
        {message ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
            {message}
          </p>
        ) : null}
      </section>

      {items.length === 0 ? (
        <div className="card border-dashed p-12 text-center text-slate">Your style template vault is empty.</div>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2">
          {items.map((row) => {
            const { parts, summary } = summarize(row.manifest);
            return (
              <li key={row.id} className="card flex flex-col gap-4 p-5 transition hover:border-gold/50">
                <div>
                  <h3 className="font-display text-2xl text-ink">{row.name}</h3>
                  <p className="mt-1 text-xs text-slate">{row.sourceLabel ?? "imported"}</p>
                  {parts.length ? <p className="mt-2 text-sm text-slate">{parts.join(" · ")}</p> : null}
                  {summary ? <p className="mt-2 line-clamp-3 text-sm text-ink/80">{summary}</p> : null}
                </div>
                <div className="mt-auto flex flex-wrap gap-2">
                  <Link href={`/app/editdna/templates/${row.id}`} className="btn btn-gold !min-h-9 text-sm">
                    Inspect
                  </Link>
                  <button type="button" className="btn btn-dark !min-h-9 text-sm" onClick={() => download(row)}>
                    Download
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost !min-h-9 text-sm text-red-800"
                    disabled={busy === row.id}
                    onClick={() => void remove(row.id, row.name)}
                  >
                    Delete
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}