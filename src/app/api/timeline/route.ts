import { json, requireOwner } from "@/server/access";
import { route } from "@/server/http";
import { mediaCounts, yearsWithMedia } from "@/server/media/queries";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = route(async (req) => {
  const ctx = await requireOwner(req);
  const [years, counts] = await Promise.all([
    yearsWithMedia(ctx.db, ctx.child.id, ctx.child.timezone),
    mediaCounts(ctx.db, ctx.child.id),
  ]);
  return json({ birthDate: ctx.child.birthDate, birthDateConfirmed: ctx.child.birthDateConfirmed, years, counts });
});
