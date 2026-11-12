import { z } from "zod";
import { HttpError, NO_STORE, requireOwner } from "@/server/access";
import { env } from "@/server/env";
import { assertUuid, route } from "@/server/http";
import { getOwnedMedia, resolveVariant } from "@/server/media/queries";
import { getStorage } from "@/server/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const q = z.object({
  v: z.enum(["thumb", "display", "poster", "original", "playback"]).default("display"),
  download: z.enum(["1"]).optional(),
});

/**
 * Authorization gate for every private file: checks the session and ownership,
 * then redirects to a short-lived signed URL for exactly one object.
 */
export const GET = route<{ id: string }>(async (req, { id }) => {
  const ctx = await requireOwner(req);
  const p = q.parse(Object.fromEntries(new URL(req.url).searchParams));
  const m = await getOwnedMedia(ctx.db, ctx.child.id, assertUuid(id));
  const target = await resolveVariant(ctx.db, m, p.download ? "original" : p.v);
  if (!target) throw new HttpError(404, "no_preview", "Preview not available yet.");
  const storage = await getStorage();
  const url = await storage.presignGet(target.key, env().MEDIA_SIGNED_URL_TTL_SECONDS, {
    contentType: target.mime,
    downloadName: p.download ? m.filenameOriginal : undefined,
  });
  return new Response(null, {
    status: 302,
    headers: { Location: url, ...NO_STORE, "Referrer-Policy": "no-referrer" },
  });
});
