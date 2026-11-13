"use client";

import { useEffect, useMemo, useState } from "react";
import { MediaThumb } from "@/components/media-thumb";
import { StudioExportPanel } from "@/components/studio-export-panel";

type Asset = {
  id: string;
  mediaId: string;
  kind: string;
  caption: string | null;
  durationSeconds: number;
  omitted: boolean;
  hero: boolean;
  position: number;
};
type Scene = { id: string; type: string; mediaId?: string; start_seconds: number; end_seconds: number };
type AudioChoice = { id: string; filename: string };
type ExportRow = { id: string; profile: string; status: string; width: number | null; height: number | null; durationSeconds: number | null; errorMessage: string | null };
type Model = {
  id: string;
  title: string;
  prompt: string;
  pipeline: string;
  profile: string;
  stage: string;
  renderRuntime: string;
  errorMessage: string | null;
  musicMediaId: string | null;
  proposal: unknown;
  assets: Asset[];
  timeline: Scene[];
  audio: AudioChoice[];
  exports: ExportRow[];
  decisions: string[];
};

const ACTIVE = new Set(["PLANNING", "ASSET_PREPARATION", "TIMELINE", "RENDERING", "AUDIO_MIX", "QUALITY_REVIEW", "UPLOADING"]);

function stageTitle(stage: string) {
  const map: Record<string, string> = {
    AWAITING_APPROVAL: "Approve the plan",
    PLANNING: "Ready to render",
    ASSET_PREPARATION: "Staging files",
    TIMELINE: "Composing the timeline",
    RENDERING: "Rendering pictures and titles",
    AUDIO_MIX: "Mixing the soundtrack",
    QUALITY_REVIEW: "Checking the finished file",
    UPLOADING: "Saving MP4",
    COMPLETED: "Complete",
    FAILED: "Render failed",
    CANCELLED: "Cancelled",
  };
  return map[stage] ?? stage.replaceAll("_", " ").toLowerCase();
}

function planHint(stage: string, shotCount: number) {
  if (ACTIVE.has(stage)) return "Rendering is running on the server. You can leave this page.";
  if (stage === "AWAITING_APPROVAL") {
    return shotCount > 20
      ? `Quick check only — ${shotCount} shots are in the cut. Approve when captions look right, or edit a few below.`
      : "Check captions and timing, then approve to unlock rendering.";
  }
  if (stage === "FAILED" || stage === "CANCELLED") return "Fix any issues above, then start rendering again.";
  if (stage === "COMPLETED") return "Your file is ready in the panel below.";
  return "Start rendering when the plan is approved.";
}

export function ProductionEditor({ initial }: { initial: Model }) {
  const [model, setModel] = useState(initial);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [showAllShots, setShowAllShots] = useState(initial.assets.length <= 12 && !ACTIVE.has(initial.stage));

  const activeShots = useMemo(() => model.assets.filter((a) => !a.omitted), [model.assets]);
  const totalSeconds = useMemo(
    () => Math.round(activeShots.reduce((sum, a) => sum + a.durationSeconds, 0)),
    [activeShots],
  );
  const heroCount = useMemo(() => activeShots.filter((a) => a.hero).length, [activeShots]);

  useEffect(() => {
    const shouldPoll = ACTIVE.has(model.stage) || model.stage === "AWAITING_APPROVAL";
    if (!shouldPoll) return;
    const timer = setInterval(async () => {
      const response = await fetch(`/api/studio/projects/${model.id}`);
      if (!response.ok) return;
      const body = await response.json();
      setModel((current) => ({
        ...current,
        stage: body.project.stage,
        errorMessage: body.project.errorMessage,
        musicMediaId: body.project.musicMediaId,
        assets: body.assets,
        timeline: body.timeline ?? current.timeline,
        audio: body.audio ?? current.audio,
        exports: body.exports.map((row: ExportRow) => ({
          id: row.id,
          profile: row.profile,
          status: row.status,
          width: row.width,
          height: row.height,
          durationSeconds: row.durationSeconds,
          errorMessage: row.errorMessage,
        })),
        decisions: body.decisions.map((row: { summary: string }) => row.summary),
      }));
    }, 4000);
    return () => clearInterval(timer);
  }, [model.id, model.stage]);

  useEffect(() => {
    if (ACTIVE.has(model.stage)) setShowAllShots(false);
  }, [model.stage]);

  async function save(asset: Asset) {
    await fetch(`/api/studio/projects/${model.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scenes: [asset] }),
    });
  }

  async function act(path: string) {
    setBusy(true);
    setMessage("");
    const response = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    const body = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setMessage(body.message || "That step was rejected.");
      return;
    }
    if (body.project) setModel((current) => ({ ...current, stage: body.project.stage }));
    else setModel((current) => ({ ...current, stage: "ASSET_PREPARATION" }));
  }

  const timelineEnd = model.timeline.at(-1)?.end_seconds ?? totalSeconds;
  const shotsToShow = showAllShots ? activeShots : activeShots.slice(0, 6);
  const editingLocked = ACTIVE.has(model.stage) || model.stage === "COMPLETED";
  const profileLabel = model.profile.replaceAll("_", " ");

  const primaryAction =
    model.stage === "AWAITING_APPROVAL" ? (
      <button className="btn btn-gold w-full sm:w-auto" type="button" disabled={busy} onClick={() => void act(`/api/studio/projects/${model.id}/approve`)}>
        Approve scene plan
      </button>
    ) : model.stage === "PLANNING" || model.stage === "FAILED" || model.stage === "CANCELLED" ? (
      <button className="btn btn-gold w-full sm:w-auto" type="button" disabled={busy} onClick={() => void act(`/api/studio/projects/${model.id}/render`)}>
        {model.stage === "FAILED" ? "Try render again" : "Render with OpenMontage"}
      </button>
    ) : null;

  return (
    <div className="space-y-4 pb-24 sm:space-y-6 sm:pb-8">
      <header>
        <p className="eyebrow text-slate">{stageTitle(model.stage)}</p>
        <h1 className="font-display mt-1 text-3xl text-ink sm:text-4xl">{model.title}</h1>
        <p className="mt-2 text-sm text-slate line-clamp-3 sm:max-w-2xl sm:text-base">{model.prompt}</p>
        <p className="mt-2 text-sm text-slate">
          {model.pipeline} · {profileLabel} · {model.renderRuntime}
        </p>
      </header>

      <section className="card sticky top-14 z-20 space-y-4 border-gold/30 p-4 shadow-sm sm:static sm:top-auto sm:z-auto sm:p-6" aria-label="Plan and next step">
        <div>
          <h2 className="font-display text-xl text-ink">What to do now</h2>
          <p className="mt-1 text-sm text-slate">{planHint(model.stage, activeShots.length)}</p>
        </div>
        <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          <div className="rounded-xl bg-ivory-2 px-3 py-2">
            <dt className="text-xs text-slate">Shots</dt>
            <dd className="font-medium text-ink">{activeShots.length}</dd>
          </div>
          <div className="rounded-xl bg-ivory-2 px-3 py-2">
            <dt className="text-xs text-slate">Length</dt>
            <dd className="font-medium text-ink">{Math.round(timelineEnd)}s with titles</dd>
          </div>
          <div className="rounded-xl bg-ivory-2 px-3 py-2">
            <dt className="text-xs text-slate">Hero shots</dt>
            <dd className="font-medium text-ink">{heroCount}</dd>
          </div>
          <div className="rounded-xl bg-ivory-2 px-3 py-2">
            <dt className="text-xs text-slate">Status</dt>
            <dd className="font-medium text-ink">{stageTitle(model.stage)}</dd>
          </div>
        </dl>
        <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
          {primaryAction}
          {ACTIVE.has(model.stage) ? (
            <button className="btn btn-ghost w-full sm:w-auto" type="button" disabled={busy} onClick={() => void act(`/api/studio/projects/${model.id}/cancel`)}>
              Cancel render
            </button>
          ) : null}
        </div>
        {message ? <p className="text-sm text-gold-deep">{message}</p> : null}
        <details className="text-sm text-slate">
          <summary className="cursor-pointer text-ink">What was decided ({model.decisions.length})</summary>
          <ul className="mt-2 space-y-1">
            {model.decisions.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </details>
      </section>

      {model.errorMessage ? <p className="card border-red-200 bg-red-50 p-4 text-sm text-red-800">{model.errorMessage}</p> : null}

      <section className="card space-y-2 p-4 sm:p-6">
        <h2 className="font-display text-xl text-ink">Soundtrack</h2>
        <label className="block text-sm text-slate">
          Library audio
          <select
            className="field mt-1"
            value={model.musicMediaId ?? ""}
            disabled={ACTIVE.has(model.stage)}
            onChange={(event) => {
              void fetch(`/api/studio/projects/${model.id}`, {
                method: "PATCH",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ musicMediaId: event.target.value || null }),
              }).then(async (response) => {
                if (!response.ok) {
                  const payload = await response.json().catch(() => ({}));
                  setMessage(payload.message || "The soundtrack was not saved.");
                  return;
                }
                const payload = await response.json();
                setModel((current) => ({ ...current, musicMediaId: payload.project.musicMediaId, decisions: payload.decisions.map((row: { summary: string }) => row.summary) }));
              });
            }}
          >
            <option value="">Intentionally silent</option>
            {model.audio.map((row) => <option key={row.id} value={row.id}>{row.filename}</option>)}
          </select>
        </label>
        {model.audio.length === 0 ? <p className="text-sm text-slate">No audio file is in the library, so this film stays silent until you upload one.</p> : null}
        <p className="text-sm text-slate">{model.musicMediaId ? "The selected file is mixed after the picture render, with a fade in, a fade out, and loudness normalization." : "No soundtrack is selected. The finished file will be marked intentionally silent."}</p>
      </section>

      <StudioExportPanel projectId={model.id} stage={model.stage} exports={model.exports} />

      <section className="card space-y-3 p-4 sm:p-6">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 className="font-display text-xl text-ink">Shot list</h2>
            <p className="text-sm text-slate">
              {editingLocked ? "Locked while rendering or after completion." : "Tap a row to adjust caption, seconds, or hero."}
            </p>
          </div>
          {activeShots.length > 6 ? (
            <button className="btn btn-ghost !min-h-9 text-sm" type="button" onClick={() => setShowAllShots((open) => !open)}>
              {showAllShots ? "Show fewer" : `Show all ${activeShots.length} shots`}
            </button>
          ) : null}
        </div>
        <ol className="space-y-2">
          {shotsToShow.map((asset, index) => {
            const scene = model.timeline.find((row) => row.mediaId === asset.mediaId);
            return (
            <li key={asset.id} className="rounded-2xl border border-ivory-2 bg-white/60 p-2 sm:p-3">
              <p className="mb-2 text-[11px] uppercase tracking-wide text-slate">
                {asset.kind} · {scene ? `${scene.start_seconds.toFixed(1)}s–${scene.end_seconds.toFixed(1)}s` : "omitted"} · fade · {asset.kind === "video" ? "original motion" : "Ken Burns"} · {model.musicMediaId ? "music under the shot" : "no music cue"}
              </p>
              <div className="flex gap-2 sm:grid sm:grid-cols-[4rem_1fr_4.5rem_auto_auto] sm:items-center sm:gap-3">
                <div className="h-16 w-16 shrink-0 sm:h-[4.5rem] sm:w-[4.5rem]">
                  <MediaThumb
                    m={{ id: asset.mediaId, kind: asset.kind, status: "ready", favorite: false, dateNeedsReview: false, durationMs: null }}
                    label={asset.caption ?? `Shot ${index + 1}`}
                  />
                </div>
                <label className="min-w-0 flex-1 text-xs text-slate sm:text-sm">
                  <span className="sr-only">Caption {index + 1}</span>
                  <input
                    className="field !min-h-10 !py-2 text-sm"
                    defaultValue={asset.caption ?? ""}
                    disabled={editingLocked}
                    placeholder={`Shot ${index + 1}`}
                    onBlur={(event) => void save({ ...asset, caption: event.target.value })}
                  />
                </label>
                <label className="text-xs text-slate sm:text-sm">
                  <span className="block text-[10px] uppercase tracking-wide text-slate sm:sr-only">Seconds</span>
                  <input
                    className="field !min-h-10 !w-16 !py-2 text-center text-sm"
                    type="number"
                    min={1}
                    max={30}
                    defaultValue={asset.durationSeconds}
                    disabled={editingLocked}
                    aria-label={`Seconds ${index + 1}`}
                    onBlur={(event) => void save({ ...asset, durationSeconds: Number(event.target.value) })}
                  />
                </label>
                <label className="flex items-center gap-1.5 whitespace-nowrap text-xs text-ink sm:text-sm">
                  <input type="checkbox" defaultChecked={asset.hero} disabled={editingLocked} onChange={(event) => void save({ ...asset, hero: event.target.checked })} />
                  Hero
                </label>
                <button className="btn btn-ghost !min-h-9 text-xs" type="button" disabled={editingLocked || asset.hero} onClick={() => void fetch(`/api/studio/projects/${model.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ scenes: model.assets.map((row) => ({ ...row, hero: row.id === asset.id })) }) }).then(() => setModel((current) => ({ ...current, assets: current.assets.map((row) => ({ ...row, hero: row.id === asset.id })) })))}>
                  {asset.hero ? "Opens the film" : "Open with this"}
                </button>
              </div>
            </li>
            );
          })}
        </ol>
        {!showAllShots && activeShots.length > 6 ? (
          <p className="text-center text-sm text-slate">Showing 6 of {activeShots.length} shots.</p>
        ) : null}
      </section>

      {primaryAction ? (
        <div className="fixed inset-x-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-30 sm:hidden">
          <div className="card flex flex-col gap-2 border-gold/40 p-3 shadow-lg">{primaryAction}</div>
        </div>
      ) : null}
    </div>
  );
}
