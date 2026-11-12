"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { MediaThumb, type ThumbMedia } from "@/components/media-thumb";

type Item = ThumbMedia & { filename: string; capturedAt: string | null; capturedSource: string };

function ymd(iso: string | null, tz: string) {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

export function ReviewList({ items, timeZone }: { items: Item[]; timeZone: string }) {
  const [done, setDone] = useState<Set<string>>(new Set());
  const [dates, setDates] = useState<Record<string, string>>(() => Object.fromEntries(items.map((i) => [i.id, ymd(i.capturedAt, timeZone)])));
  const [error, setError] = useState<string | null>(null);

  async function save(id: string, body: Record<string, unknown>) {
    setError(null);
    try {
      await apiFetch(`/api/media/${id}`, { method: "PATCH", body });
      setDone((d) => new Set(d).add(id));
    } catch (e) {
      setError((e as Error).message);
    }
  }

  return (
    <>
      {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((i) => (
          <li key={i.id} className={`card flex gap-3 p-3 ${done.has(i.id) ? "opacity-50" : ""}`}>
            <div className="w-28 shrink-0">
              <MediaThumb m={i} href={`/app/memories/${i.id}`} />
            </div>
            <div className="min-w-0 flex-1 space-y-2">
              <p className="truncate text-xs text-slate" title={i.filename}>{i.filename}</p>
              <p className="text-xs text-slate">
                {i.capturedAt ? `Suggested ${ymd(i.capturedAt, timeZone)} (${i.capturedSource})` : "No date found"}
              </p>
              <input
                type="date"
                className="field !min-h-10 !py-1 text-sm"
                value={dates[i.id] ?? ""}
                onChange={(e) => setDates((d) => ({ ...d, [i.id]: e.target.value }))}
                aria-label={`Date for ${i.filename}`}
                disabled={done.has(i.id)}
              />
              {done.has(i.id) ? (
                <p className="text-xs text-emerald-700">Saved</p>
              ) : (
                <div className="flex gap-2">
                  <button className="btn btn-dark !min-h-9 flex-1 !px-3 text-xs" disabled={!dates[i.id]} onClick={() => save(i.id, { capturedAt: dates[i.id] })}>
                    Save
                  </button>
                  {i.capturedAt && dates[i.id] === ymd(i.capturedAt, timeZone) && (
                    <button className="btn btn-ghost !min-h-9 flex-1 !px-3 text-xs" onClick={() => save(i.id, { confirmDate: true })}>
                      Correct
                    </button>
                  )}
                </div>
              )}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
