"use client";

import { useEffect, useState } from "react";
import { uploadFile } from "@/lib/upload-client";
import { Uploader } from "./uploader";

type ImportStatus = {
  id: string;
  label: string | null;
  status: string;
  entriesTotal: number;
  accepted: number;
  duplicates: number;
  rejected: number;
  errors: { entry: string; reason: string }[];
  progress: number;
};

export function ImportPanel() {
  const [progress, setProgress] = useState<number | null>(null);
  const [importId, setImportId] = useState<string | null>(null);
  const [status, setStatus] = useState<ImportStatus | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!importId) return;
    let stop = false;
    const tick = async () => {
      const r = await fetch(`/api/imports/${importId}`);
      if (r.ok) {
        const d = (await r.json()) as { import: ImportStatus };
        if (!stop) setStatus(d.import);
        if (d.import.status === "ready" || d.import.status === "failed") return;
      }
      if (!stop) setTimeout(tick, 2000);
    };
    void tick();
    return () => {
      stop = true;
    };
  }, [importId]);

  async function onZip(file: File | undefined) {
    if (!file) return;
    setError(null);
    setStatus(null);
    setImportId(null);
    setProgress(0);
    try {
      const r = await uploadFile(file, {
        purpose: "import",
        signal: new AbortController().signal,
        onProgress: setProgress,
      });
      if (r.kind === "import") setImportId(r.importId);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setProgress(null);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section id="zip" className="card space-y-3 p-6" aria-label="Import a ZIP archive">
        <h2 className="font-display text-2xl">Import a ZIP archive</h2>
        <p className="text-sm text-slate">
          For the existing family archive (for example the 76-photo SWrit folder). Folders inside the ZIP are fine. Duplicates are skipped
          automatically, so importing the same ZIP twice is safe. Large archives (200 MB+) are supported.
        </p>
        <label className="btn btn-dark cursor-pointer">
          Choose ZIP file
          <input type="file" accept=".zip,application/zip" className="sr-only" data-testid="zip-input"
            onChange={(e) => {
              void onZip(e.target.files?.[0]);
              e.target.value = ""; // allow choosing the same archive again
            }}
          />
        </label>
        {progress !== null && (
          <p className="text-sm" role="status">Uploading archive… {Math.round(progress * 100)}%</p>
        )}
        {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
        {status && (
          <div className="rounded-xl bg-ivory-2 p-4 text-sm" role="status" aria-live="polite" data-testid="import-status" data-status={status.status}>
            <p>
              <strong>{status.status === "ready" ? "Import finished" : status.status === "failed" ? "Import stopped" : "Importing…"}</strong>{" "}
              {status.entriesTotal ? `(${Math.round(status.progress * 100)}%)` : ""}
            </p>
            <p className="mt-1">
              {status.accepted} added · {status.duplicates} already here · {status.rejected} skipped
            </p>
            {status.errors.length > 0 && (
              <details className="mt-2">
                <summary className="cursor-pointer">Skipped files</summary>
                <ul className="mt-1 max-h-48 overflow-auto text-xs">
                  {status.errors.map((e, i) => (
                    <li key={i}>
                      <span className="font-mono">{e.entry}</span>: {e.reason}
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </section>
      <section className="card space-y-3 p-6" aria-label="Add a past birthday film">
        <h2 className="font-display text-2xl">Add a past birthday film</h2>
        <p className="text-sm text-slate">
          Upload an MP4 you already made (like the earlier 4K birthday edits). It appears in the Birthday Theatre as a past edition and can be
          played straight away.
        </p>
        <Uploader purpose="legacy_film" accept="video/*" compact />
      </section>
    </div>
  );
}
