"use client";

export type Purpose = "media" | "import" | "audio" | "legacy_film";

export class UploadError extends Error {
  constructor(
    message: string,
    public code?: string,
    public retryable = true,
  ) {
    super(message);
  }
}

async function api<T>(path: string, body: unknown, signal?: AbortSignal): Promise<T> {
  const r = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  const data = (await r.json().catch(() => ({}))) as { message?: string; error?: string };
  if (!r.ok) {
    throw new UploadError(data.message ?? `Request failed (${r.status})`, data.error, r.status >= 500 || r.status === 429 || r.status === 409);
  }
  return data as T;
}

/** SHA-256 for early duplicate detection (skipped for very large files to protect phone memory). */
export async function sha256(file: File): Promise<string | undefined> {
  if (file.size > 60 * 1024 * 1024 || !globalThis.crypto?.subtle) return undefined;
  const buf = await file.arrayBuffer();
  const hash = await crypto.subtle.digest("SHA-256", buf);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function guessMime(file: File): string {
  if (file.type) return file.type;
  const ext = file.name.toLowerCase().split(".").pop();
  const map: Record<string, string> = {
    heic: "image/heic",
    heif: "image/heif",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    mov: "video/quicktime",
    mp4: "video/mp4",
    zip: "application/zip",
    m4a: "audio/x-m4a",
    mp3: "audio/mpeg",
    wav: "audio/wav",
  };
  return (ext && map[ext]) || "application/octet-stream";
}

function put(url: string, body: Blob, headers: Record<string, string>, onProgress: (loaded: number) => void, signal: AbortSignal) {
  return new Promise<string | null>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => onProgress(e.loaded);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve(xhr.getResponseHeader("ETag"));
      else reject(new UploadError(`Storage rejected the upload (${xhr.status})`, "storage", xhr.status >= 500 || xhr.status === 403));
    };
    xhr.onerror = () => reject(new UploadError("Network error while uploading", "network"));
    xhr.ontimeout = () => reject(new UploadError("Upload timed out", "timeout"));
    const abort = () => {
      xhr.abort();
      reject(new UploadError("Cancelled", "cancelled", false));
    };
    if (signal.aborted) return abort();
    signal.addEventListener("abort", abort, { once: true });
    xhr.send(body);
  });
}

async function withRetry<T>(fn: () => Promise<T>, signal: AbortSignal, tries = 4): Promise<T> {
  let last: unknown;
  for (let i = 0; i < tries; i++) {
    try {
      return await fn();
    } catch (err) {
      last = err;
      if (signal.aborted || (err instanceof UploadError && !err.retryable)) throw err;
      await new Promise((r) => setTimeout(r, 800 * 2 ** i));
    }
  }
  throw last;
}

export type UploadResult =
  | { kind: "media"; mediaId: string }
  | { kind: "import"; importId: string }
  | { kind: "duplicate"; mediaId: string };

type InitResponse =
  | { duplicate: { mediaId: string } }
  | { sessionId: string; putUrl: string; headers: Record<string, string> }
  | { sessionId: string; multipart: { partSize: number; partCount: number } };

export async function uploadFile(
  file: File,
  opts: {
    purpose?: Purpose;
    allowDuplicate?: boolean;
    signal: AbortSignal;
    onProgress: (fraction: number) => void;
    onPhase?: (phase: "checking" | "uploading" | "verifying") => void;
  },
): Promise<UploadResult> {
  const purpose = opts.purpose ?? "media";
  opts.onPhase?.("checking");
  const hash = purpose === "media" && !opts.allowDuplicate ? await sha256(file) : undefined;
  const init = await withRetry(
    () =>
      api<InitResponse>(
        "/api/uploads/init",
        {
          filename: file.name,
          mime: guessMime(file),
          bytes: file.size,
          sha256: hash,
          lastModified: file.lastModified || undefined,
          purpose,
          allowDuplicate: !!opts.allowDuplicate,
        },
        opts.signal,
      ),
    opts.signal,
  );
  if ("duplicate" in init) return { kind: "duplicate", mediaId: init.duplicate.mediaId };
  const sessionId = init.sessionId;
  opts.onPhase?.("uploading");
  try {
    let parts: { partNumber: number; etag: string }[] | undefined;
    if ("putUrl" in init) {
      await withRetry(() => put(init.putUrl, file, init.headers, (l) => opts.onProgress(l / file.size), opts.signal), opts.signal);
    } else {
      const { partSize, partCount } = init.multipart;
      const loaded = new Map<number, number>();
      const report = () => opts.onProgress([...loaded.values()].reduce((a, b) => a + b, 0) / file.size);
      parts = [];
      let next = 1;
      const worker = async () => {
        while (next <= partCount) {
          const n = next++;
          const blob = file.slice((n - 1) * partSize, Math.min(file.size, n * partSize));
          const etag = await withRetry(async () => {
            const { urls } = await api<{ urls: Record<string, string> }>("/api/uploads/part", { sessionId, partNumbers: [n] }, opts.signal);
            const e = await put(urls[n], blob, {}, (l) => {
              loaded.set(n, l);
              report();
            }, opts.signal);
            if (!e) throw new UploadError("Storage did not confirm the part (check R2 CORS ExposeHeaders: ETag)", "etag", false);
            return e;
          }, opts.signal, 5);
          loaded.set(n, blob.size);
          report();
          parts!.push({ partNumber: n, etag });
        }
      };
      await Promise.all([worker(), worker(), worker()]);
    }
    opts.onPhase?.("verifying");
    const done = await withRetry(
      () =>
        api<{ media?: { id: string }; importId?: string }>("/api/uploads/complete", { sessionId, parts }, opts.signal),
      opts.signal,
      3,
    );
    if (done.importId) return { kind: "import", importId: done.importId };
    return { kind: "media", mediaId: done.media!.id };
  } catch (err) {
    // Clean up the server session so nothing half-written lingers.
    fetch("/api/uploads/abort", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId }),
      keepalive: true,
    }).catch(() => {});
    throw err;
  }
}
