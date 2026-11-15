"use client";

import Link from "next/link";
import { useCallback, useMemo, useState } from "react";

export type VaultItem = {
  id: string;
  projectId: string;
  projectTitle: string;
  pipeline: string;
  profile: string;
  width: number | null;
  height: number | null;
  durationSeconds: number | null;
  createdAt: string;
};

const FILTERS = [
  { id: "all", label: "All exports" },
  { id: "instagram_reels", label: "Instagram Reels" },
  { id: "youtube_shorts", label: "YouTube Shorts" },
  { id: "tiktok", label: "TikTok" },
] as const;

function profileLabel(profile: string) {
  return profile.replaceAll("_", " ");
}

function formatDuration(seconds: number | null) {
  if (!seconds) return null;
  const s = Math.round(seconds);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const r = s % 60;
  return r ? `${m}m ${r}s` : `${m}m`;
}

function formatDate(iso: string) {
  try {
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function aspectClass(width: number | null, height: number | null) {
  if (width && height && width > height) return "aspect-video";
  return "aspect-[9/16]";
}

export function ReelsVault({ initial }: { initial: VaultItem[] }) {
  const [items, setItems] = useState(initial);
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const visible = useMemo(
    () => (filter === "all" ? items : items.filter((row) => row.profile === filter)),
    [filter, items],
  );

  const refresh = useCallback(async (profile?: string) => {
    const q = profile && profile !== "all" ? `?profile=${encodeURIComponent(profile)}` : "";
    const response = await fetch(`/api/studio/vault${q}`);
    if (!response.ok) return;
    const body = (await response.json()) as { items: VaultItem[] };
    setItems(body.items);
  }, []);

  async function remove(row: VaultItem) {
    const ok = window.confirm(
      `Delete “${row.projectTitle}” (${profileLabel(row.profile)})? The MP4 is removed from storage and the database record is erased.`,
    );
    if (!ok) return;
    setBusyId(row.id);
    setMessage("");
    const response = await fetch(`/api/studio/projects/${row.projectId}?export=${row.id}`, { method: "DELETE" });
    setBusyId(null);
    if (!response.ok) {
      const body = await response.json().catch(() => ({}));
      setMessage((body as { message?: string }).message ?? "Could not delete that export.");
      return;
    }
    setItems((current) => current.filter((item) => item.id !== row.id));
  }

  const chip = (active: boolean) =>
    `whitespace-nowrap rounded-full border px-3 py-1.5 text-sm transition ${
      active ? "border-midnight bg-midnight text-ivory" : "border-ivory-2 bg-white/60 hover:border-gold"
    }`;

  return (
    <div className="space-y-8">
      <nav aria-label="Export filters" className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            className={chip(filter === f.id)}
            aria-pressed={filter === f.id}
            onClick={() => {
              setFilter(f.id);
              void refresh(f.id);
            }}
          >
            {f.label}
          </button>
        ))}
      </nav>

      {message ? (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800" role="alert">
          {message}
        </p>
      ) : null}

      {visible.length === 0 ? (
        <div className="card border-dashed p-12 text-center">
          <p className="font-display text-2xl text-ink">No saved exports yet</p>
          <p className="mx-auto mt-2 max-w-md text-sm text-slate">
            Finish a render in AI Studio or Ready to post. Each completed MP4 appears here for preview, download, and deletion.
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <Link href="/app/ai-studio" className="btn btn-gold">
              Open AI Studio
            </Link>
            <Link href="/app/ai-studio/post" className="btn">
              Ready to post
            </Link>
          </div>
        </div>
      ) : (
        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((row) => {
            const playback = `/api/studio/projects/${row.projectId}/playback?export=${row.id}`;
            const download = `${playback}&download=1`;
            const vertical = !row.width || !row.height || row.height >= row.width;
            return (
              <li key={row.id} className="card group overflow-hidden p-0 transition hover:border-gold/60 hover:shadow-md">
                <div className={`relative w-full overflow-hidden bg-midnight ${aspectClass(row.width, row.height)}`}>
                  <video
                    className="h-full w-full object-cover"
                    src={playback}
                    preload="metadata"
                    controls
                    playsInline
                    aria-label={`Preview: ${row.projectTitle}`}
                  />
                  <span className="absolute top-3 left-3 rounded-full bg-midnight/80 px-2.5 py-1 text-xs font-medium text-ivory backdrop-blur-sm">
                    {profileLabel(row.profile)}
                  </span>
                  {row.durationSeconds ? (
                    <span className="absolute bottom-3 right-3 rounded-full bg-black/55 px-2 py-0.5 text-xs text-ivory">
                      {formatDuration(row.durationSeconds)}
                    </span>
                  ) : null}
                </div>
                <div className="space-y-3 p-4">
                  <div>
                    <h2 className="font-display text-xl leading-tight text-ink line-clamp-2">{row.projectTitle}</h2>
                    <p className="mt-1 text-xs text-slate">
                      {row.pipeline.replaceAll("-", " ")}
                      {row.width && row.height ? ` · ${row.width}×${row.height}` : ""}
                      {vertical ? " · vertical" : " · landscape"}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-light">Saved {formatDate(row.createdAt)}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <a className="btn btn-dark !min-h-9 flex-1 text-sm sm:flex-none" href={download}>
                      Download
                    </a>
                    <a className="btn btn-gold !min-h-9 flex-1 text-sm sm:flex-none" href={playback} target="_blank" rel="noreferrer">
                      Play full
                    </a>
                    <Link className="btn !min-h-9 text-sm" href={`/app/ai-studio/${row.projectId}`}>
                      Production
                    </Link>
                    <button
                      type="button"
                      className="btn btn-ghost !min-h-9 text-sm text-red-800 hover:bg-red-50"
                      disabled={busyId === row.id}
                      onClick={() => void remove(row)}
                    >
                      {busyId === row.id ? "Deleting…" : "Delete"}
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}