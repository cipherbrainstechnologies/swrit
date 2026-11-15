"use client";

import { useState } from "react";

export function TemplateDetail({
  id,
  name,
  manifest,
}: {
  id: string;
  name: string;
  manifest: Record<string, unknown>;
}) {
  const [busy, setBusy] = useState(false);
  const json = JSON.stringify(manifest, null, 2);

  function download() {
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${name.replace(/[^a-z0-9_-]+/gi, "-") || "template"}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function remove() {
    if (!window.confirm(`Delete “${name}” from the vault?`)) return;
    setBusy(true);
    const response = await fetch(`/api/editdna/templates/${id}`, { method: "DELETE" });
    setBusy(false);
    if (response.ok) window.location.href = "/app/editdna/templates";
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn btn-gold" onClick={download}>
          Download JSON
        </button>
        <button type="button" className="btn btn-ghost text-red-800" disabled={busy} onClick={() => void remove()}>
          {busy ? "Deleting…" : "Delete"}
        </button>
      </div>
      <pre className="card overflow-x-auto p-4 font-mono text-xs leading-relaxed text-ink sm:text-sm">{json}</pre>
    </div>
  );
}