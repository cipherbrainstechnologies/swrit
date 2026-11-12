"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "@/lib/api";
import type { PublicMedia } from "@/server/media/queries";

const SUGGESTIONS = [
  "One little smile, a thousand beautiful memories.",
  "Tiny steps. Endless possibilities.",
  "Every adventure has been better with you.",
  "And somehow, the years flew by.",
];

function toDateInput(iso: string | null, timeZone: string) {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
}

const sourceLabel: Record<string, string> = {
  exif: "from the camera",
  filename: "from the file name",
  user: "set by you",
  filesystem: "from the file’s modified time (uncertain)",
  unknown: "unknown",
};

export function MemoryEditor({
  media,
  albums,
  isCover,
  timeZone,
}: {
  media: PublicMedia;
  albums: { id: string; name: string; member: boolean }[];
  isCover: boolean;
  timeZone: string;
}) {
  const router = useRouter();
  const [caption, setCaption] = useState(media.caption ?? "");
  const [story, setStory] = useState(media.story ?? "");
  const [date, setDate] = useState(toDateInput(media.capturedAt, timeZone));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function act(fn: () => Promise<unknown>, done: string) {
    setBusy(true);
    setMsg(null);
    try {
      await fn();
      setMsg(done);
      router.refresh();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const patch = (body: Record<string, unknown>) => apiFetch(`/api/media/${media.id}`, { method: "PATCH", body });

  return (
    <aside className="space-y-5">
      {media.status === "duplicate" && (
        <div className="card space-y-2 border-amber-300 bg-amber-50 p-4 text-sm">
          <p>This is an exact copy of a memory that is already in the archive.</p>
          <div className="flex flex-wrap gap-2">
            <a className="btn btn-ghost !min-h-9" href={`/app/memories/${media.duplicateOfId}`}>See the original</a>
            <button className="btn btn-ghost !min-h-9" disabled={busy} onClick={() => act(() => patch({ keepDuplicate: true }), "Kept both copies.")}>Keep both</button>
            <button
              className="btn btn-dark !min-h-9"
              disabled={busy}
              onClick={() => act(async () => { await apiFetch(`/api/media/${media.id}`, { method: "DELETE" }); router.push(`/app/memories/${media.duplicateOfId}`); }, "Moved the copy to Trash.")}
            >
              Remove this copy
            </button>
          </div>
        </div>
      )}

      <div className="card space-y-3 p-5">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl">Caption</h2>
          <button
            className={`btn !min-h-9 !px-3 ${media.favorite ? "btn-gold" : "btn-ghost"}`}
            aria-pressed={media.favorite}
            disabled={busy}
            onClick={() => act(() => patch({ favorite: !media.favorite }), media.favorite ? "Removed from favourites." : "Added to favourites.")}
          >
            ★ {media.favorite ? "Favourite" : "Favourite?"}
          </button>
        </div>
        <textarea
          className="field min-h-20"
          maxLength={500}
          placeholder="What was happening? e.g. “This was your first trip to Vietnam.”"
          value={caption}
          onChange={(e) => setCaption(e.target.value)}
          aria-label="Caption"
        />
        <details className="text-xs text-slate">
          <summary className="cursor-pointer">Gentle caption ideas (only use one if it’s true for this photo)</summary>
          <ul className="mt-2 space-y-1">
            {SUGGESTIONS.map((s) => (
              <li key={s}>
                <button type="button" className="text-left underline-offset-2 hover:underline" onClick={() => setCaption(s)}>
                  {s}
                </button>
              </li>
            ))}
          </ul>
        </details>
        <label className="block">
          <span className="mb-1 block text-sm">Here’s what happened that day</span>
          <textarea className="field min-h-28" maxLength={10000} value={story} onChange={(e) => setStory(e.target.value)} />
        </label>
        <button className="btn btn-dark w-full" disabled={busy} onClick={() => act(() => patch({ caption, story }), "Saved.")}>
          Save words
        </button>
      </div>

      <div className="card space-y-3 p-5">
        <h2 className="font-display text-2xl">When was this?</h2>
        <p className="text-xs text-slate">
          Date source: {sourceLabel[media.capturedSource] ?? media.capturedSource}
          {media.dateNeedsReview ? " · needs your confirmation" : ""}
        </p>
        <input type="date" className="field" value={date} onChange={(e) => setDate(e.target.value)} max={toDateInput(new Date().toISOString(), timeZone)} aria-label="Date taken" />
        <div className="flex gap-2">
          <button className="btn btn-dark flex-1" disabled={busy || !date} onClick={() => act(() => patch({ capturedAt: date }), "Date saved.")}>
            Save date
          </button>
          {media.dateNeedsReview && media.capturedAt && (
            <button className="btn btn-ghost flex-1" disabled={busy} onClick={() => act(() => patch({ confirmDate: true }), "Date confirmed.")}>
              It’s correct
            </button>
          )}
        </div>
      </div>

      <div className="card space-y-2 p-5">
        <h2 className="font-display text-2xl">Albums</h2>
        {albums.map((a) => (
          <label key={a.id} className="flex min-h-11 items-center gap-3 text-sm">
            <input
              type="checkbox"
              className="h-5 w-5 accent-[#B8954F]"
              defaultChecked={a.member}
              disabled={busy}
              onChange={(e) =>
                act(
                  () => apiFetch(`/api/albums/${a.id}/media`, { body: { mediaIds: [media.id], action: e.target.checked ? "add" : "remove" } }),
                  e.target.checked ? `Added to ${a.name}.` : `Removed from ${a.name}.`,
                )
              }
            />
            {a.name}
          </label>
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        {media.kind === "image" && !isCover && (
          <button className="btn btn-ghost" disabled={busy} onClick={() => act(() => apiFetch("/api/settings", { method: "PATCH", body: { coverMediaId: media.id } }), "Set as the home page photo.")}>
            Use as home photo
          </button>
        )}
        <a className="btn btn-ghost" href={`/api/media/${media.id}/access?download=1`}>Download original</a>
        <button
          className="btn btn-ghost text-red-800"
          disabled={busy}
          onClick={() => {
            if (!confirm("Move this memory to Trash? The original is kept until you empty the Trash.")) return;
            void act(async () => {
              await apiFetch(`/api/media/${media.id}`, { method: "DELETE" });
              router.push("/app/library");
            }, "Moved to Trash.");
          }}
        >
          Move to Trash
        </button>
      </div>
      {msg && <p role="status" className="text-sm text-slate">{msg}</p>}
      <p className="text-xs text-slate">
        {media.filename} · {(media.bytes / 1024 / 1024).toFixed(1)} MB{media.width ? ` · ${media.width}×${media.height}` : ""}
      </p>
    </aside>
  );
}
