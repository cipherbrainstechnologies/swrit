import { z } from "zod";
import { json, requireOwner } from "@/server/access";
import { route } from "@/server/http";
import { listMedia, publicMedia } from "@/server/media/queries";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const q = z.object({
  year: z.coerce.number().int().min(1990).max(2100).optional(),
  kind: z.enum(["image", "video", "audio"]).optional(),
  favorite: z.enum(["1", "true"]).optional(),
  review: z.enum(["1", "true"]).optional(),
  trash: z.enum(["1", "true"]).optional(),
  album: z.string().uuid().optional(),
  order: z.enum(["captured", "recent"]).optional(),
  cursor: z.string().max(12).optional(),
  limit: z.coerce.number().int().min(1).max(200).optional(),
});

export const GET = route(async (req) => {
  const ctx = await requireOwner(req);
  const p = q.parse(Object.fromEntries(new URL(req.url).searchParams));
  const r = await listMedia(ctx.db, ctx.child.id, {
    year: p.year,
    kind: p.kind,
    favorite: !!p.favorite,
    review: !!p.review,
    trash: !!p.trash,
    albumId: p.album,
    order: p.order,
    cursor: p.cursor,
    limit: p.limit,
    timeZone: ctx.child.timezone,
  });
  return json({ items: r.items.map(publicMedia), nextCursor: r.nextCursor });
});
