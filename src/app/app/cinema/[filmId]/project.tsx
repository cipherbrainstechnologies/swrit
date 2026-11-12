"use client";

import Link from "next/link";
import { useState } from "react";
import { RenderPanel } from "@/components/render-panel";

type Shot = { mediaId: string; caption: string | null; duration: number; chapterKey: string };

export function CinemaProject({
  filmId,
  title,
  phase,
  status,
  skippedUndated,
  hasRender,
  shots,
  renderEnabled,
}: {
  filmId: string;
  title: string;
  phase: string | null;
  status: string;
  skippedUndated: number;
  hasRender: boolean;
  shots: Shot[];
  renderEnabled: boolean;
}) {
  const [error, setError] = useState<string | null>(null);
  const [order, setOrder] = useState(shots);

  async function saveShot(shot: Shot, patch: { caption?: string; pinned?: boolean; omitted?: boolean; order?: number }) {
    setError(null);
    const res = await fetch(`/api/films/${filmId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ scenes: [{ mediaId: shot.mediaId, ...patch }] }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) setError(data.message || "Could not save that shot.");
  }

  return (
    <div className="space-y-8">
      <header>
        <Link href="/app/cinema" className="text-sm text-gold-deep hover:underline">← Cinema</Link>
        <h1 className="font-display mt-2 text-4xl sm:text-5xl text-ink">{title}</h1>
        <p className="mt-2 text-sm text-slate">{phase || status}{skippedUndated ? ` · ${skippedUndated} undated pictures left out for review` : ""}{hasRender ? " · MP4 ready" : ""}</p>
      </header>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <RenderPanel filmId={filmId} enabled={renderEnabled} renderMode="cinema" />
      <ol className="space-y-3">
        {order.map((shot, index) => (
          <li key={shot.mediaId} className="card p-4">
            <p className="text-xs uppercase tracking-wide text-gold-deep">{shot.chapterKey} · {shot.duration.toFixed(1)}s</p>
            <label className="mt-2 block text-sm font-medium text-ink">
              Caption
              <input
                className="field mt-1"
                defaultValue={shot.caption ?? ""}
                maxLength={200}
                onBlur={(event) => void saveShot(shot, { caption: event.target.value })}
              />
            </label>
            <div className="mt-3 flex flex-wrap gap-2">
              <button className="btn btn-ghost !min-h-9 text-xs" type="button" onClick={() => void saveShot(shot, { pinned: true })}>Hero</button>
              <button className="btn btn-ghost !min-h-9 text-xs" type="button" onClick={() => void saveShot(shot, { omitted: true })}>Leave out</button>
              <button
                className="btn btn-ghost !min-h-9 text-xs"
                type="button"
                onClick={() => {
                  if (index === 0) return;
                  const next = order.slice();
                  const [item] = next.splice(index, 1);
                  next.splice(index - 1, 0, item);
                  setOrder(next);
                  void saveShot(item, { order: index - 1 });
                }}
              >
                Move up
              </button>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}
