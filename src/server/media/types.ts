/** Accepted media. Anything else is rejected after magic-byte sniffing. */
export const IMAGE_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/avif",
]);
export const VIDEO_MIME = new Set(["video/mp4", "video/quicktime", "video/webm", "video/3gpp", "video/x-m4v"]);
export const AUDIO_MIME = new Set([
  "audio/mpeg",
  "audio/mp4",
  "audio/x-m4a",
  "audio/aac",
  "audio/wav",
  "audio/x-wav",
  "audio/vnd.wave",
  "audio/ogg",
  "audio/webm",
]);
export const ZIP_MIME = new Set(["application/zip", "application/x-zip-compressed"]);

export type MediaKind = "image" | "video" | "audio";

export function kindForMime(mime: string | undefined | null): MediaKind | null {
  if (!mime) return null;
  if (IMAGE_MIME.has(mime)) return "image";
  if (VIDEO_MIME.has(mime)) return "video";
  if (AUDIO_MIME.has(mime)) return "audio";
  return null;
}

/** Declared MIME types a browser may send for accepted files. */
export function declaredMimeAllowed(mime: string, purpose: "media" | "import" | "audio" | "legacy_film"): boolean {
  if (purpose === "import") return ZIP_MIME.has(mime) || mime === "application/octet-stream";
  if (purpose === "audio") return AUDIO_MIME.has(mime) || mime === "video/mp4" || mime === "application/octet-stream";
  if (purpose === "legacy_film") return VIDEO_MIME.has(mime);
  // Some Android galleries send an empty type or octet-stream for HEIC; magic bytes decide later.
  return IMAGE_MIME.has(mime) || VIDEO_MIME.has(mime) || mime === "application/octet-stream";
}

export function extensionMime(name: string): string | null {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  const map: Record<string, string> = {
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    png: "image/png",
    webp: "image/webp",
    heic: "image/heic",
    heif: "image/heif",
    avif: "image/avif",
    mp4: "video/mp4",
    m4v: "video/x-m4v",
    mov: "video/quicktime",
    webm: "video/webm",
    "3gp": "video/3gpp",
    mp3: "audio/mpeg",
    m4a: "audio/x-m4a",
    aac: "audio/aac",
    wav: "audio/wav",
    ogg: "audio/ogg",
    zip: "application/zip",
  };
  return map[ext] ?? null;
}

/** Sniff the real type from the first bytes of the file. */
export async function sniffMime(head: Uint8Array): Promise<string | null> {
  const { fileTypeFromBuffer } = await import("file-type");
  const r = await fileTypeFromBuffer(head);
  if (!r) return null;
  // Normalise a few aliases.
  const mime = r.mime as string;
  if (mime === "audio/vnd.wave") return "audio/wav";
  return mime;
}

/** Strip path components and control characters from a user-supplied file name. */
export function safeDisplayName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "file";
  const cleaned = base.replace(/[\u0000-\u001f\u007f]/g, "").trim().slice(0, 200);
  return cleaned || "file";
}
