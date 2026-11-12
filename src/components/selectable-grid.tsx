"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { MediaThumb, type ThumbMedia } from "./media-thumb";

type Item = ThumbMedia & { caption: string | null };

export function SelectableGrid({
  items,
  albums,
  trash = false,
  albumId,
}: {
  items: Item[];
  albums: { id: string; name: string }[];
  trash?: boolean;
  albumId?: string;
}) {
  const router = useRouter();
  const [selecting, setSelecting] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  async function run(fn: () => Promise<string>) {
    setBusy(true);
    setMsg(null);
    try {
      setMsg(await fn());
      setSelected(new Set());
      setSelecting(false);
      router.refresh();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const ids = [...selected];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button className="btn btn-ghost !min-h-9 text-sm" onClick={() => { setSelecting((s) => !s); setSelected(new Set()); }}>
          {selecting ? "Done selecting" : "Select"}
        </button>
        {selecting && (
          <>
            <span className="text-sm text-slate">{ids.length} selected</span>
            {!trash && (
              <>
                <button
                  disabled={!ids.length || busy}
                  className="btn btn-ghost !min-h-9 text-sm"
                  onClick={() =>
                    run(async () => {
                      for (const id of ids) await apiFetch(`/api/media/${id}`, { method: "PATCH", body: { favorite: true } });
                      return `Marked ${ids.length} as favourite.`;
                    })
                  }
                >
                  ★ Favourite
                </button>
                {albumId ? (
                  <button
                    disabled={!ids.length || busy}
                    className="btn btn-ghost !min-h-9 text-sm"
                    onClick={() =>
                      run(async () => {
                        await apiFetch(`/api/albums/${albumId}/media`, { body: { mediaIds: ids, action: "remove" } });
                        return `Removed ${ids.length} from this album.`;
                      })
                    }
                  >
                    Remove from album
                  </button>
                ) : (
                  <select
                    disabled={!ids.length || busy}
                    aria-label="Add selected to album"
                    className="field !min-h-9 !w-auto !py-1 text-sm"
                    value=""
                    onChange={(e) => {
                      const a = albums.find((x) => x.id === e.target.value);
                      if (!a) return;
                      void run(async () => {
                        await apiFetch(`/api/albums/${a.id}/media`, { body: { mediaIds: ids, action: "add" } });
                        return `Added ${ids.length} to “${a.name}”.`;
                      });
                    }}
                  >
                    <option value="">Add to album…</option>
                    {albums.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                )}
                <button
                  disabled={!ids.length || busy}
                  className="btn btn-ghost !min-h-9 text-sm"
                  onClick={() =>
                    run(async () => {
                      for (const id of ids) await apiFetch(`/api/media/${id}`, { method: "DELETE" });
                      return `Moved ${ids.length} to Trash. Originals are kept until you empty it.`;
                    })
                  }
                >
                  Move to Trash
                </button>
              </>
            )}
            {trash && (
              <button
                disabled={!ids.length || busy}
                className="btn btn-ghost !min-h-9 text-sm"
                onClick={() =>
                  run(async () => {
                    for (const id of ids) await apiFetch(`/api/media/${id}`, { method: "PATCH", body: { restore: true } });
                    return `Restored ${ids.length}.`;
                  })
                }
              >
                Restore
              </button>
            )}
          </>
        )}
        {msg && <span role="status" className="text-sm text-slate">{msg}</span>}
      </div>
      <ul className="grid grid-cols-3 gap-1.5 sm:grid-cols-5 sm:gap-2 lg:grid-cols-6" data-testid="media-grid">
        {items.map((m) => (
          <li key={m.id} className="relative" data-testid="media-item">
            {selecting ? (
              <button
                type="button"
                className={`block w-full rounded-xl ${selected.has(m.id) ? "ring-4 ring-gold" : ""}`}
                aria-pressed={selected.has(m.id)}
                aria-label={m.caption ?? "Select memory"}
                onClick={() => toggle(m.id)}
              >
                <MediaThumb m={m} label={m.caption ?? undefined} />
              </button>
            ) : (
              <MediaThumb m={m} href={trash ? undefined : `/app/memories/${m.id}`} label={m.caption ?? undefined} />
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
