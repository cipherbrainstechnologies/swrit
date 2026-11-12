"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { CHAPTERS } from "@/film/plan";
import { mediaUrl } from "@/components/media-thumb";

type SceneRow = { mediaId: string; caption: string | null; chapterKey: string; duration: number; pinned: boolean };

export function Studio(props: {
  filmId: string;
  title: string;
  opening: string[];
  closing: string[];
  duration: number;
  status: string;
  scenes: SceneRow[];
  omitted: { id: string; caption: string | null }[];
}) {
  const router = useRouter();
  const [title, setTitle] = useState(props.title);
  const [opening, setOpening] = useState(props.opening.join("\n"));
  const [closing, setClosing] = useState(props.closing.join("\n"));
  const [duration, setDuration] = useState(props.duration);
  const [captions, setCaptions] = useState<Record<string, string>>(() => Object.fromEntries(props.scenes.map((s) => [s.mediaId, s.caption ?? ""])));
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const patch = async (body: Record<string, unknown>, done: string) => {
    setBusy(true);
    setMsg(null);
    try {
      await apiFetch(`/api/films/${props.filmId}`, { method: "PATCH", body });
      setMsg(done);
      router.refresh();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const lines = (s: string) => s.split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 5);
  const chapterTitle = (k: string) => CHAPTERS.find((c) => c.key === k)?.title ?? k;
  let lastChapter = "";

  return (
    <div className="space-y-6">
      <section className="card grid gap-4 p-6 md:grid-cols-2">
        <label className="block text-sm md:col-span-2">
          Film title
          <input className="field mt-1" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} />
        </label>
        <label className="block text-sm">
          Opening banner (one line each)
          <textarea className="field mt-1 min-h-28" value={opening} onChange={(e) => setOpening(e.target.value)} />
        </label>
        <label className="block text-sm">
          Closing banner (one line each)
          <textarea className="field mt-1 min-h-28" value={closing} onChange={(e) => setClosing(e.target.value)} />
        </label>
        <label className="block text-sm">
          Target length: {Math.floor(duration / 60)} min {duration % 60} s
          <input type="range" min={60} max={420} step={15} value={duration} onChange={(e) => setDuration(Number(e.target.value))} className="mt-2 w-full accent-[#B8954F]" />
        </label>
        <div className="flex flex-wrap items-end gap-2">
          <button
            className="btn btn-dark"
            disabled={busy}
            onClick={() =>
              patch(
                {
                  title,
                  openingTitle: lines(opening),
                  closingTitle: lines(closing),
                  durationTargetSeconds: duration,
                  scenes: props.scenes.map((s) => ({ mediaId: s.mediaId, caption: captions[s.mediaId] || null })),
                },
                "Saved. The film is a draft until you approve it.",
              )
            }
          >
            Save changes
          </button>
          <button className="btn btn-gold" disabled={busy} onClick={() => patch({ approve: true }, "Approved. You can now render the MP4.")}>
            Approve film
          </button>
          <Link className="btn btn-ghost" href={`/theatre/${props.filmId}`}>Preview ▶</Link>
        </div>
        <p className="text-xs text-slate md:col-span-2">Status: {props.status}. Nothing is published or shared automatically.</p>
      </section>

      <section className="space-y-3">
        <h2 className="font-display text-2xl">Scenes ({props.scenes.length})</h2>
        <ol className="space-y-2">
          {props.scenes.map((s) => {
            const header = s.chapterKey !== lastChapter ? chapterTitle(s.chapterKey) : null;
            lastChapter = s.chapterKey;
            return (
              <li key={s.mediaId}>
                {header && <p className="eyebrow mt-4 mb-2 text-gold-deep">{header}</p>}
                <div className="card flex items-center gap-3 p-2">
                  <img src={mediaUrl(s.mediaId, "thumb")} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover" loading="lazy" />
                  <input
                    className="field !min-h-10 flex-1 !py-1 text-sm"
                    placeholder="On-screen caption (optional, only what is true)"
                    value={captions[s.mediaId] ?? ""}
                    maxLength={200}
                    onChange={(e) => setCaptions((c) => ({ ...c, [s.mediaId]: e.target.value }))}
                    aria-label="Caption"
                  />
                  <span className="hidden text-xs text-slate sm:inline">{s.duration.toFixed(1)} s</span>
                  <button
                    className={`btn !min-h-9 !px-3 text-xs ${s.pinned ? "btn-gold" : "btn-ghost"}`}
                    disabled={busy}
                    aria-pressed={s.pinned}
                    onClick={() => patch({ scenes: [{ mediaId: s.mediaId, pinned: !s.pinned }] }, s.pinned ? "Unpinned." : "Pinned: always included.")}
                  >
                    {s.pinned ? "Pinned" : "Pin"}
                  </button>
                  <button
                    className="btn btn-ghost !min-h-9 !px-3 text-xs"
                    disabled={busy}
                    onClick={() => patch({ scenes: [{ mediaId: s.mediaId, omitted: true }] }, "Left out of the film.")}
                  >
                    Leave out
                  </button>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      {props.omitted.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-display text-2xl">Left out ({props.omitted.length})</h2>
          <div className="flex flex-wrap gap-2">
            {props.omitted.map((m) => (
              <button
                key={m.id}
                className="relative"
                disabled={busy}
                onClick={() => patch({ scenes: [{ mediaId: m.id, omitted: false }] }, "Added back.")}
                title="Add back"
              >
                <img src={mediaUrl(m.id, "thumb")} alt="" className="h-16 w-16 rounded-lg object-cover opacity-60" />
                <span className="absolute inset-0 flex items-center justify-center text-xs font-semibold">Add back</span>
              </button>
            ))}
          </div>
        </section>
      )}
      {msg && <p role="status" className="sticky bottom-4 rounded-full bg-midnight px-4 py-2 text-center text-sm text-ivory">{msg}</p>}
    </div>
  );
}
