"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { apiFetch } from "@/lib/api";
import { uploadFile } from "@/lib/upload-client";
import { FINALE_LABEL } from "@/film/melody";

type AudioFile = { id: string; name: string; durationMs: number | null; status: string };

export function MusicPanel({
  filmId,
  current,
  files,
}: {
  filmId: string;
  current: { mediaId: string; rightsConfirmed: boolean } | null;
  files: AudioFile[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [rights, setRights] = useState(current?.rightsConfirmed ?? false);

  const patch = async (body: Record<string, unknown>, done: string) => {
    setBusy(true);
    setMsg(null);
    try {
      await apiFetch(`/api/films/${filmId}`, { method: "PATCH", body });
      setMsg(done);
      router.refresh();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  async function upload(file?: File) {
    if (!file) return;
    setBusy(true);
    setMsg("Uploading song…");
    try {
      const r = await uploadFile(file, { purpose: "audio", signal: new AbortController().signal, onProgress: (p) => setMsg(`Uploading song… ${Math.round(p * 100)}%`) });
      if (r.kind === "media") {
        await apiFetch(`/api/films/${filmId}`, { method: "PATCH", body: { audioMediaId: r.mediaId, audioRightsConfirmed: rights } });
        setMsg("Song added. It will play for the birthday finale.");
        router.refresh();
      }
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card space-y-3 p-6">
      <h2 className="font-display text-2xl">Birthday music</h2>
      {current ? (
        <p className="text-sm">
          The finale plays <strong>your uploaded song</strong>
          {current.rightsConfirmed ? "." : ". Please confirm you recorded it yourself or have the right to use it."}
        </p>
      ) : (
        <p className="text-sm text-slate">
          No song uploaded, so the film uses an original instrumental and, for the finale, the traditional {FINALE_LABEL}. It is clearly an
          instrumental: no voices are generated.
        </p>
      )}
      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          className="mt-0.5 h-5 w-5 accent-[#B8954F]"
          checked={rights}
          onChange={(e) => {
            setRights(e.target.checked);
            if (current) void patch({ audioRightsConfirmed: e.target.checked }, "Saved.");
          }}
        />
        <span>This recording is ours (for example, the family singing) or we have permission to use it.</span>
      </label>
      <div className="flex flex-wrap gap-2">
        <label className="btn btn-dark cursor-pointer">
          Upload a song (MP3, M4A, WAV)
          <input type="file" accept="audio/*,.m4a,.mp3,.wav" className="sr-only" disabled={busy} onChange={(e) => upload(e.target.files?.[0])} />
        </label>
        {current && (
          <button className="btn btn-ghost" disabled={busy} onClick={() => patch({ audioMediaId: null }, "Using the instrumental finale.")}>
            Use the instrumental instead
          </button>
        )}
      </div>
      {files.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer">Uploaded audio ({files.length})</summary>
          <ul className="mt-2 space-y-1">
            {files.map((f) => (
              <li key={f.id} className="flex items-center justify-between gap-2">
                <span className="truncate">{f.name}{f.durationMs ? ` · ${Math.round(f.durationMs / 1000)} s` : ""}</span>
                {current?.mediaId !== f.id && (
                  <button className="btn btn-ghost !min-h-8 !px-3 text-xs" disabled={busy} onClick={() => patch({ audioMediaId: f.id, audioRightsConfirmed: rights }, "Song selected.")}>
                    Use
                  </button>
                )}
              </li>
            ))}
          </ul>
        </details>
      )}
      {msg && <p role="status" className="text-sm text-slate">{msg}</p>}
    </div>
  );
}
