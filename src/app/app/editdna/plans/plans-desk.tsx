"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { edlDurationSec, parseEdl } from "@/editdna/schema";

export type PlanRow = {
  id: string;
  title: string;
  templateId: string | null;
  notes: string | null;
  createdAt: string;
  edl: Record<string, unknown>;
};

export function PlansDesk({ initial }: { initial: PlanRow[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [importText, setImportText] = useState("");
  const [expanded, setExpanded] = useState<string | null>(null);

  const durations = useMemo(() => {
    const map = new Map<string, number>();
    for (const row of items) {
      try {
        map.set(row.id, Math.round(edlDurationSec(parseEdl(row.edl))));
      } catch {
        map.set(row.id, 0);
      }
    }
    return map;
  }, [items]);

  async function refresh() {
    const response = await fetch("/api/editdna/plans");
    if (!response.ok) return;
    const body = (await response.json()) as { items: PlanRow[] };
    setItems(body.items);
  }

  async function importEdl() {
    setBusy("import");
    setMessage("");
    let edl: unknown;
    try {
      edl = JSON.parse(importText);
    } catch {
      setBusy(null);
      setMessage("Paste valid EditDNA EDL JSON (edl_version 1).");
      return;
    }
    const response = await fetch("/api/editdna/plans", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ edl }),
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

  async function remove(id: string, title: string) {
    if (!window.confirm(`Delete edit plan “${title}”?`)) return;
    setBusy(id);
    const response = await fetch(`/api/editdna/plans/${id}`, { method: "DELETE" });
    setBusy(null);
    if (!response.ok) {
      setMessage("Delete failed.");
      return;
    }
    setItems((rows) => rows.filter((r) => r.id !== id));
  }

  function download(row: PlanRow) {
    const blob = new Blob([JSON.stringify(row.edl, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${row.title.replace(/[^a-z0-9_-]+/gi, "-") || "edit-plan"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-8">
      <section className="card space-y-4 p-6">
        <h2 className="font-display text-xl text-ink">Import EDL</h2>
        <p className="text-sm text-slate">From `editdna apply` or hand-tuned `editdna build` input.</p>
        <textarea
          className="field min-h-[140px] font-mono text-sm"
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
          placeholder='{"name":"my-reel","edl_version":1,"items":[...]}'
        />
        <button type="button" className="btn btn-gold" disabled={!!busy} onClick={() => void importEdl()}>
          {busy === "import" ? "Importing…" : "Import EDL"}
        </button>
        {message ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
            {message}
          </p>
        ) : null}
      </section>

      {items.length === 0 ? (
        <div className="card border-dashed p-12 text-center text-slate">No edit plans saved yet.</div>
      ) : (
        <ul className="space-y-3">
          {items.map((row) => {
            const shots = Array.isArray(row.edl.items) ? row.edl.items.length : 0;
            const dur = durations.get(row.id) ?? 0;
            const open = expanded === row.id;
            return (
              <li key={row.id} className="card overflow-hidden">
                <h3 className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                  <span>
                    <span className="font-display text-xl text-ink">{row.title}</span>
                    <span className="mt-1 block text-xs text-slate">
                      {shots} clips · ~{dur}s · EDL v1
                    </span>
                  </span>
                  <span className="flex flex-wrap gap-2">
                    <button type="button" className="btn btn-gold !min-h-9 text-sm" onClick={() => download(row)}>
                      Download
                    </button>
                    <button type="button" className="btn !min-h-9 text-sm" onClick={() => setExpanded(open ? null : row.id)}>
                      {open ? "Hide" : "Preview"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-ghost !min-h-9 text-sm text-red-800"
                      disabled={busy === row.id}
                      onClick={() => void remove(row.id, row.title)}
                    >
                      Delete
                    </button>
                  </span>
                </h3>
                {open ? (
                  <pre className="max-h-96 overflow-auto border-t border-ivory-2 bg-ivory-2/40 p-4 font-mono text-xs text-ink">
                    {JSON.stringify(row.edl, null, 2)}
                  </pre>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}