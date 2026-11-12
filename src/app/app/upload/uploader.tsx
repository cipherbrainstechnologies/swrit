"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { uploadFile, UploadError, type Purpose } from "@/lib/upload-client";

type Status = "queued" | "checking" | "uploading" | "verifying" | "done" | "duplicate" | "error" | "cancelled";

type Item = {
  id: string;
  file: File;
  status: Status;
  progress: number;
  error?: string;
  mediaId?: string;
  duplicateOf?: string;
  allowDuplicate?: boolean;
  preview?: string;
};

const CONCURRENCY = 3;

function size(n: number) {
  if (n > 1024 ** 3) return `${(n / 1024 ** 3).toFixed(2)} GB`;
  if (n > 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${Math.ceil(n / 1024)} KB`;
}

export function Uploader({ purpose = "media", accept = "image/*,video/*", compact = false }: { purpose?: Purpose; accept?: string; compact?: boolean }) {
  const [items, setItems] = useState<Item[]>([]);
  const controllers = useRef(new Map<string, AbortController>());
  const running = useRef(new Set<string>());
  const [drag, setDrag] = useState(false);

  const update = useCallback((id: string, patch: Partial<Item>) => {
    setItems((list) => list.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }, []);

  const start = useCallback(
    async (item: Item) => {
      if (running.current.has(item.id)) return;
      running.current.add(item.id);
      const c = new AbortController();
      controllers.current.set(item.id, c);
      update(item.id, { status: "checking", progress: 0, error: undefined });
      try {
        const r = await uploadFile(item.file, {
          purpose,
          allowDuplicate: item.allowDuplicate,
          signal: c.signal,
          onProgress: (p) => update(item.id, { progress: p }),
          onPhase: (phase) => update(item.id, { status: phase }),
        });
        if (r.kind === "duplicate") update(item.id, { status: "duplicate", duplicateOf: r.mediaId });
        else if (r.kind === "media") update(item.id, { status: "done", progress: 1, mediaId: r.mediaId });
        else update(item.id, { status: "done", progress: 1 });
      } catch (err) {
        const cancelled = err instanceof UploadError && err.code === "cancelled";
        update(item.id, {
          status: cancelled ? "cancelled" : "error",
          error: cancelled ? undefined : (err as Error).message || "Upload failed",
        });
      } finally {
        running.current.delete(item.id);
        controllers.current.delete(item.id);
      }
    },
    [purpose, update],
  );

  // Simple scheduler: keep up to CONCURRENCY uploads in flight.
  useEffect(() => {
    const active = items.filter((i) => ["checking", "uploading", "verifying"].includes(i.status)).length;
    const waiting = items.filter((i) => i.status === "queued" && !running.current.has(i.id));
    for (const i of waiting.slice(0, Math.max(0, CONCURRENCY - active))) void start(i);
  }, [items, start]);

  const busy = items.some((i) => ["queued", "checking", "uploading", "verifying"].includes(i.status));
  useEffect(() => {
    if (!busy) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [busy]);

  function add(files: FileList | File[] | null) {
    if (!files) return;
    const next: Item[] = [...files].map((file) => ({
      id: crypto.randomUUID(),
      file,
      status: "queued",
      progress: 0,
      preview: file.type.startsWith("image/") && file.size < 25 * 1024 * 1024 ? URL.createObjectURL(file) : undefined,
    }));
    setItems((l) => [...next, ...l]);
  }

  useEffect(
    () => () => {
      for (const i of items) if (i.preview) URL.revokeObjectURL(i.preview);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const done = items.filter((i) => i.status === "done").length;
  const failed = items.filter((i) => i.status === "error");
  const dups = items.filter((i) => i.status === "duplicate");

  return (
    <section aria-label="Upload photos and videos" className="space-y-4">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDrag(true);
        }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDrag(false);
          add(e.dataTransfer.files);
        }}
        className={`card flex flex-col items-center gap-4 border-2 border-dashed p-8 text-center transition ${drag ? "border-gold bg-gold/10" : ""} ${compact ? "p-5" : ""}`}
      >
        {!compact && <p className="font-display text-2xl">Choose from your gallery</p>}
        <div className="flex flex-wrap justify-center gap-3">
          <label className="btn btn-dark cursor-pointer">
            {purpose === "media" ? "Select photos & videos" : "Choose file"}
            <input
              type="file"
              multiple={purpose === "media"}
              accept={accept}
              className="sr-only"
              data-testid={`file-input-${purpose}`}
              onChange={(e) => {
                add(e.target.files);
                e.target.value = "";
              }}
            />
          </label>
          {purpose === "media" && (
            <label className="btn btn-ghost cursor-pointer">
              Take a photo or video
              <input
                type="file"
                accept="image/*,video/*"
                capture="environment"
                className="sr-only"
                onChange={(e) => {
                  add(e.target.files);
                  e.target.value = "";
                }}
              />
            </label>
          )}
        </div>
        {!compact && <p className="text-xs text-slate">Or drag files here on a computer. Keep this page open while uploading.</p>}
      </div>

      {items.length > 0 && (
        <div className="card p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-ivory-2 pb-3 text-sm">
            <span role="status" aria-live="polite">
              {done} of {items.length} uploaded{failed.length ? ` · ${failed.length} need attention` : ""}
              {dups.length ? ` · ${dups.length} already in the archive` : ""}
            </span>
            <span className="flex gap-2">
              {failed.length > 0 && (
                <button
                  className="btn btn-ghost !min-h-9 text-sm"
                  onClick={() => setItems((l) => l.map((i) => (i.status === "error" ? { ...i, status: "queued" } : i)))}
                >
                  Retry failed
                </button>
              )}
              {done > 0 && !busy && purpose === "media" && (
                <Link href="/app/library?order=recent" className="btn btn-dark !min-h-9 text-sm">
                  See them in the library
                </Link>
              )}
            </span>
          </div>
          <ul className="divide-y divide-ivory-2">
            {items.map((i) => (
              <li key={i.id} className="flex items-center gap-3 py-3" data-testid="upload-row" data-status={i.status}>
                <div className="h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-ivory-2">
                  {i.preview ? <img src={i.preview} alt="" className="h-full w-full object-cover" /> : (
                    <div className="flex h-full items-center justify-center text-[10px] text-slate">{i.file.type.startsWith("video") ? "VIDEO" : "FILE"}</div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm">{i.file.name}</div>
                  <div className="text-xs text-slate">
                    {size(i.file.size)} ·{" "}
                    {i.status === "queued" && "Waiting"}
                    {i.status === "checking" && "Checking"}
                    {i.status === "uploading" && `Uploading ${Math.round(i.progress * 100)}%`}
                    {i.status === "verifying" && "Verifying"}
                    {i.status === "done" && <span className="text-emerald-700">Saved</span>}
                    {i.status === "cancelled" && "Cancelled"}
                    {i.status === "duplicate" && <span className="text-amber-800">Already in the archive</span>}
                    {i.status === "error" && <span className="text-red-700">{i.error}</span>}
                  </div>
                  {["uploading", "verifying", "checking"].includes(i.status) && (
                    <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-ivory-2" role="progressbar" aria-valuenow={Math.round(i.progress * 100)} aria-valuemin={0} aria-valuemax={100}>
                      <div className="h-full bg-gold transition-[width]" style={{ width: `${Math.round(i.progress * 100)}%` }} />
                    </div>
                  )}
                </div>
                <div className="flex shrink-0 gap-1">
                  {["queued", "checking", "uploading", "verifying"].includes(i.status) && (
                    <button
                      className="btn btn-ghost !min-h-9 !px-3 text-xs"
                      onClick={() => {
                        controllers.current.get(i.id)?.abort();
                        if (i.status === "queued") update(i.id, { status: "cancelled" });
                      }}
                    >
                      Cancel
                    </button>
                  )}
                  {(i.status === "error" || i.status === "cancelled") && (
                    <button className="btn btn-ghost !min-h-9 !px-3 text-xs" onClick={() => update(i.id, { status: "queued" })}>
                      Retry
                    </button>
                  )}
                  {i.status === "duplicate" && (
                    <>
                      <Link href={`/app/memories/${i.duplicateOf}`} className="btn btn-ghost !min-h-9 !px-3 text-xs">
                        View
                      </Link>
                      <button
                        className="btn btn-ghost !min-h-9 !px-3 text-xs"
                        onClick={() => update(i.id, { status: "queued", allowDuplicate: true })}
                      >
                        Keep both
                      </button>
                      <button className="btn btn-ghost !min-h-9 !px-3 text-xs" onClick={() => update(i.id, { status: "cancelled" })}>
                        Skip
                      </button>
                    </>
                  )}
                  {i.status === "done" && i.mediaId && (
                    <Link href={`/app/memories/${i.mediaId}`} className="btn btn-ghost !min-h-9 !px-3 text-xs">
                      Open
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <p className="pt-3 text-xs text-slate">
            Large videos upload in 16 MB pieces and retry automatically. If you close this page mid-upload, that file will need to be chosen again.
          </p>
        </div>
      )}
    </section>
  );
}
