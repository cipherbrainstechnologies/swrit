"use client";

const STAGE_PROGRESS: Record<string, number> = {
  PLANNING: 0.12,
  ASSET_PREPARATION: 0.38,
  RENDERING: 0.62,
  QUALITY_REVIEW: 0.82,
  UPLOADING: 0.94,
  COMPLETED: 1,
};

const STAGE_LABEL: Record<string, string> = {
  PLANNING: "Planning the cut",
  ASSET_PREPARATION: "Staging library files",
  RENDERING: "Rendering with OpenMontage",
  QUALITY_REVIEW: "Checking the MP4",
  UPLOADING: "Saving to your private archive",
  COMPLETED: "Complete",
  FAILED: "Failed",
  CANCELLED: "Cancelled",
  AWAITING_APPROVAL: "Waiting for your approval",
};

type ExportRow = {
  id: string;
  profile: string;
  status: string;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  errorMessage: string | null;
};

export function StudioExportPanel({ projectId, stage, exports: rows }: { projectId: string; stage: string; exports: ExportRow[] }) {
  const activeExport = rows.find((row) => row.status === "queued" || row.status === "processing");
  const ready = rows.filter((row) => row.status === "ready");
  const running = ["PLANNING", "ASSET_PREPARATION", "RENDERING", "QUALITY_REVIEW", "UPLOADING"].includes(stage);
  const pct = running ? Math.round((STAGE_PROGRESS[stage] ?? 0.2) * 100) : stage === "COMPLETED" ? 100 : 0;
  const label = STAGE_LABEL[stage] ?? stage.replaceAll("_", " ").toLowerCase();

  return (
    <section className="card space-y-4 p-4 sm:p-6" aria-label="Studio render progress" data-testid="studio-export-panel">
      <div>
        <h2 className="font-display text-xl sm:text-2xl text-ink">{running ? "Rendering in progress" : ready.length ? "Your MP4 is ready" : "Finished video"}</h2>
        <p className="mt-1 text-sm text-slate">
          {running
            ? "The worker is building your file. You can leave this page — progress updates automatically."
            : ready.length
              ? "Saved in your private bucket. Play or download below."
              : "After approval, start rendering. The file will appear here when done."}
        </p>
      </div>
      {running || activeExport ? (
        <div className="space-y-2" role="status" aria-live="polite">
          <p className="text-sm font-medium text-ink">
            {label}
            {activeExport ? ` · ${activeExport.profile.replaceAll("_", " ")}` : ""}
            {running ? ` · ${pct}%` : ""}
          </p>
          <div className="h-2.5 overflow-hidden rounded-full bg-ivory-2">
            <div className="h-full bg-gold transition-[width]" style={{ width: `${Math.max(4, pct)}%` }} />
          </div>
        </div>
      ) : null}
      {ready.map((row) => (
        <div key={row.id} className="rounded-xl bg-ivory-2 p-4 text-sm" data-testid="studio-export-ready">
          <p className="text-ink">
            {row.profile.replaceAll("_", " ")}
            {row.width ? ` · ${row.width}×${row.height}` : ""}
            {row.durationSeconds ? ` · ${Math.round(row.durationSeconds)} s` : ""}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a className="btn btn-dark" href={`/api/studio/projects/${projectId}/playback?export=${row.id}&download=1`}>
              Download MP4
            </a>
            <a className="btn btn-gold" href={`/api/studio/projects/${projectId}/playback?export=${row.id}`}>
              Play
            </a>
          </div>
        </div>
      ))}
      {rows
        .filter((row) => row.status === "failed")
        .slice(0, 1)
        .map((row) => (
          <p key={row.id} className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">
            Last export failed: {row.errorMessage}
          </p>
        ))}
    </section>
  );
}
