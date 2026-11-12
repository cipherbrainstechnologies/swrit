"use client";

import { useEffect, useState } from "react";
import { StudioExportPanel } from "@/components/studio-export-panel";

type Asset = { id: string; caption: string | null; durationSeconds: number; omitted: boolean; hero: boolean; position: number };
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
  proposal: unknown;
  assets: Asset[];
  exports: ExportRow[];
  decisions: string[];
};

const ACTIVE = new Set(["PLANNING", "ASSET_PREPARATION", "RENDERING", "QUALITY_REVIEW", "UPLOADING"]);

export function ProductionEditor({ initial }: { initial: Model }) {
  const [model, setModel] = useState(initial);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!ACTIVE.has(model.stage) && model.stage !== "AWAITING_APPROVAL") return;
    const timer = setInterval(async () => {
      const response = await fetch(`/api/studio/projects/${model.id}`);
      if (!response.ok) return;
      const body = await response.json();
      setModel((current) => ({
        ...current,
        stage: body.project.stage,
        errorMessage: body.project.errorMessage,
        assets: body.assets,
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

  async function save(asset: Asset) {
    await fetch(`/api/studio/projects/${model.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ scenes: [asset] }),
    });
  }

  async function act(path: string) {
    setMessage("");
    const response = await fetch(path, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      setMessage(body.message || "That step was rejected.");
      return;
    }
    if (body.project) setModel((current) => ({ ...current, stage: body.project.stage }));
    else setModel((current) => ({ ...current, stage: "ASSET_PREPARATION" }));
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="eyebrow text-slate">{model.stage.replaceAll("_", " ")}</p>
        <h1 className="font-display mt-2 text-4xl text-ink">{model.title}</h1>
        <p className="mt-2 max-w-2xl text-slate">{model.prompt}</p>
        <p className="mt-2 text-sm text-slate">
          {model.pipeline} · {model.profile} · {model.renderRuntime}
        </p>
      </header>
      {model.errorMessage ? <p className="card border-red-200 bg-red-50 p-4 text-sm text-red-800">{model.errorMessage}</p> : null}
      <StudioExportPanel projectId={model.id} stage={model.stage} exports={model.exports} />
      <section className="card space-y-2 p-4 sm:p-6">
        <h2 className="font-display text-2xl text-ink">What was decided</h2>
        <ul className="space-y-1 text-sm text-slate">
          {model.decisions.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </section>
      <section className="card space-y-3 p-4 sm:p-6">
        <h2 className="font-display text-2xl text-ink">Shots</h2>
        {model.assets.map((asset, index) => (
          <div key={asset.id} className="grid gap-2 rounded-2xl border border-ivory-2 bg-white/50 p-3 sm:grid-cols-[1fr_6rem_auto]">
            <input
              className="field !min-h-10"
              defaultValue={asset.caption ?? ""}
              aria-label={`Caption ${index + 1}`}
              onBlur={(event) => void save({ ...asset, caption: event.target.value })}
            />
            <input
              className="field !min-h-10"
              type="number"
              min={1}
              max={30}
              defaultValue={asset.durationSeconds}
              aria-label={`Seconds ${index + 1}`}
              onBlur={(event) => void save({ ...asset, durationSeconds: Number(event.target.value) })}
            />
            <label className="flex items-center gap-2 text-sm text-ink">
              <input type="checkbox" defaultChecked={asset.hero} onChange={(event) => void save({ ...asset, hero: event.target.checked })} />
              Hero
            </label>
          </div>
        ))}
      </section>
      <div className="flex flex-wrap gap-3">
        {model.stage === "AWAITING_APPROVAL" ? (
          <button className="btn btn-gold" type="button" onClick={() => void act(`/api/studio/projects/${model.id}/approve`)}>
            Approve scene plan
          </button>
        ) : null}
        {model.stage === "PLANNING" || model.stage === "FAILED" || model.stage === "CANCELLED" ? (
          <button className="btn btn-gold" type="button" onClick={() => void act(`/api/studio/projects/${model.id}/render`)}>
            Render with OpenMontage
          </button>
        ) : null}
        {ACTIVE.has(model.stage) ? (
          <button className="btn" type="button" onClick={() => void act(`/api/studio/projects/${model.id}/cancel`)}>
            Cancel
          </button>
        ) : null}
      </div>
      {message ? <p className="text-sm text-gold-deep">{message}</p> : null}
    </div>
  );
}
