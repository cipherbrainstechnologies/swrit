"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

type JobView = {
  id: string;
  status: "queued" | "processing" | "ready" | "failed" | "cancelled";
  progress: number;
  resolution: string | null;
  errorMessage: string | null;
  createdAt: string;
};
type FilmView = { status: string; hasRender: boolean; renderedMeta: Record<string, unknown> | null };

export function RenderPanel({
  filmId,
  enabled,
  theatreHref,
  renderMode = "film",
}: {
  filmId: string;
  enabled: boolean;
  theatreHref?: string;
  /** Cinema films need skill and audio checks on the dedicated route. */
  renderMode?: "film" | "cinema";
}) {
  const [film, setFilm] = useState<FilmView | null>(null);
  const [jobs, setJobs] = useState<JobView[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const d = await apiFetch<{ film: FilmView; jobs: JobView[] }>(`/api/films/${filmId}/jobs`);
      setFilm(d.film);
      setJobs(d.jobs);
      return d.jobs.some((j) => j.status === "queued" || j.status === "processing");
    } catch (e) {
      setErr((e as Error).message);
      return false;
    }
  }, [filmId]);

  useEffect(() => {
    let stop = false;
    let timer: ReturnType<typeof setTimeout>;
    const loop = async () => {
      const active = await refresh();
      if (!stop) timer = setTimeout(loop, active ? 3000 : 15000);
    };
    void loop();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [refresh]);

  async function render(resolution: "1080p" | "2160p") {
    setBusy(true);
    setErr(null);
    try {
      const path = renderMode === "cinema" ? `/api/cinema/projects/${filmId}/render` : `/api/films/${filmId}/render`;
      await apiFetch(path, { body: { resolution, idempotencyKey: crypto.randomUUID() } });
      await refresh();
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const active = jobs.find((j) => j.status === "queued" || j.status === "processing");
  const meta = film?.renderedMeta as {
    width?: number;
    height?: number;
    durationSeconds?: number;
    fps?: number;
    videoCodec?: string;
    audioCodec?: string;
  } | null;
  const playHref = theatreHref ?? `/theatre/${filmId}`;

  return (
    <section className="card space-y-4 p-6" aria-label="Video render and download" data-testid="render-panel">
      <div>
        <h2 className="font-display text-2xl">Make a video file</h2>
        <p className="text-sm text-slate">
          Renders the film into a private MP4 on the server. When it is ready, play it in the theatre, download it here,
          or open this film again from Cinema. You can leave this page while rendering.
        </p>
      </div>
      {!enabled && <p className="text-sm text-amber-800">Video rendering is turned off on this server.</p>}
      {film?.hasRender && meta && (
        <div className="rounded-xl bg-ivory-2 p-4 text-sm" data-testid="render-ready">
          <p>
            <strong className="text-ink">Saved in your private archive.</strong>{" "}
            {meta.width}×{meta.height}, {meta.fps} fps, {Math.round(meta.durationSeconds ?? 0)} s, {meta.videoCodec}/
            {meta.audioCodec} (checked with ffprobe)
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a className="btn btn-dark" href={`/api/films/${filmId}/playback?download=1`}>
              Download MP4
            </a>
            <a className="btn btn-ghost" href={playHref}>
              Play in theatre
            </a>
          </div>
        </div>
      )}
      {active ? (
        <div className="space-y-2" role="status" aria-live="polite">
          <p className="text-sm text-ink">
            {active.status === "queued" ? "Waiting for the renderer…" : `Rendering ${active.resolution ?? ""}… ${Math.round(active.progress * 100)}%`}
          </p>
          <div className="h-2 overflow-hidden rounded-full bg-ivory-2">
            <div className="h-full bg-gold transition-[width]" style={{ width: `${Math.max(4, Math.round(active.progress * 100))}%` }} />
          </div>
          <button className="btn btn-ghost !min-h-9 text-sm" onClick={() => apiFetch(`/api/jobs/${active.id}/cancel`, { body: {} }).then(refresh)}>
            Cancel
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-dark" disabled={!enabled || busy} onClick={() => render("1080p")}>
            Render 1080p MP4
          </button>
          <button className="btn btn-ghost" disabled={!enabled || busy} onClick={() => render("2160p")} title="Needs a larger server; slower">
            Render 4K (slow)
          </button>
        </div>
      )}
      {jobs[0]?.status === "failed" && !active && <p className="text-sm text-red-700">Last render failed: {jobs[0].errorMessage}</p>}
      {err && <p className="text-sm text-red-700">{err}</p>}
    </section>
  );
}
