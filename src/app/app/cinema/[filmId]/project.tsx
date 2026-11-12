"use client";

import Link from "next/link";
import { useState } from "react";

type Shot = { mediaId: string; caption: string | null; duration: number; chapterKey: string };

export function CinemaProject({
  filmId,
  title,
  phase,
  status,
  skippedUndated,
  hasRender,
  shots,
}: {
  filmId: string;
  title: string;
  phase: string | null;
  status: string;
  skippedUndated: number;
  hasRender: boolean;
  shots: Shot[];
}) {
  const [message, setMessage] = useState<string | null>(null);
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

  async function render(resolution: "1080p" | "2160p") {
    setError(null);
    setMessage(null);
    const res = await fetch(`/api/cinema/projects/${filmId}/render`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ resolution, idempotencyKey: `${resolution}-${Date.now()}` }),
    });
    const data = await res.json();
    if (!res.ok) setError(data.message || "Render was not queued.");
    else setMessage(resolution === "1080p" ? "Preview queued." : "Final 4K render queued.");
  }

  return (
    <div className="space-y-8">
      <header>
        <Link href="/app/cinema" className="text-sm text-slate hover:underline">← Cinema</Link>
        <h1 className="font-display mt-2 text-4xl sm:text-5xl">{title}</h1>
        <p className="mt-2 text-sm text-slate">{phase || status}{skippedUndated ? ` · ${skippedUndated} undated pictures left out for review` : ""}</p>
      </header>
      {message ? <p className="text-sm text-ivory">{message}</p> : null}
      {error ? <p className="text-sm text-gold">{error}</p> : null}
      <div className="flex flex-wrap gap-3">
        <button className="btn btn-dark" type="button" onClick={() => void render("1080p")}>Generate preview</button>
        <button className="btn btn-gold" type="button" onClick={() => void render("2160p")}>Approve final render</button>
        {hasRender ? <Link className="btn btn-ghost" href={`/theatre/${filmId}`}>Play</Link> : null}
      </div>
      <ol className="space-y-3">
        {order.map((shot, index) => (
          <li key={shot.mediaId} className="rounded-3xl border border-white/10 p-4">
            <p className="text-xs uppercase tracking-wide text-gold">{shot.chapterKey} · {shot.duration.toFixed(1)}s</p>
            <label className="mt-2 block text-sm text-slate">
              Caption
              <input
                className="mt-1 w-full rounded-2xl border border-white/10 bg-transparent px-3 py-3 text-ivory"
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
