import { Readable } from "node:stream";
import { getStorage } from "@/server/storage";
import { decodeToken, writePartOrObject } from "@/server/storage/local";
import { env } from "@/server/env";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Development/test stand-in for R2 presigned URLs. The HMAC token *is* the
 * authorization (like an S3 signature) and expires quickly.
 */
function denied(status = 403) {
  return new Response("Forbidden", { status, headers: { "Cache-Control": "no-store" } });
}

export async function PUT(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const storage = await getStorage();
  if (storage.driver !== "local") return denied(404);
  const t = decodeToken((await ctx.params).token);
  if (!t || t.m !== "PUT") return denied();
  if (!t.u && t.ct && (req.headers.get("content-type") ?? "") !== t.ct) return denied();
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > env().MAX_UPLOAD_MB * 1024 * 1024) return denied(413);
  if (!req.body) return new Response("Missing body", { status: 400 });
  const { etag } = await writePartOrObject(t, Readable.fromWeb(req.body as never));
  return new Response(null, {
    status: 200,
    headers: { ETag: etag, "Access-Control-Expose-Headers": "ETag", "Cache-Control": "no-store" },
  });
}

export async function GET(req: Request, ctx: { params: Promise<{ token: string }> }) {
  const storage = await getStorage();
  if (storage.driver !== "local") return denied(404);
  const t = decodeToken((await ctx.params).token);
  if (!t || t.m !== "GET") return denied();
  const head = await storage.head(t.k);
  if (!head) return new Response("Not found", { status: 404 });
  const headers = new Headers({
    "Content-Type": t.ct ?? head.contentType ?? "application/octet-stream",
    "Cache-Control": "private, max-age=120",
    "Accept-Ranges": "bytes",
    "X-Content-Type-Options": "nosniff",
    "Cross-Origin-Resource-Policy": "same-origin",
  });
  if (t.dn) headers.set("Content-Disposition", `attachment; filename*=UTF-8''${encodeURIComponent(t.dn)}`);
  const range = /^bytes=(\d+)-(\d*)$/.exec(req.headers.get("range") ?? "");
  if (range) {
    const start = Number(range[1]);
    const end = range[2] ? Math.min(Number(range[2]), head.bytes - 1) : head.bytes - 1;
    if (start >= head.bytes || start > end) return new Response(null, { status: 416 });
    headers.set("Content-Range", `bytes ${start}-${end}/${head.bytes}`);
    headers.set("Content-Length", String(end - start + 1));
    const s = await storage.getStream(t.k, { start, end });
    return new Response(Readable.toWeb(s) as ReadableStream, { status: 206, headers });
  }
  headers.set("Content-Length", String(head.bytes));
  const s = await storage.getStream(t.k);
  return new Response(Readable.toWeb(s) as ReadableStream, { status: 200, headers });
}
