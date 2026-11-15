import { json, requireOwner } from "@/server/access";
import { deleteEditdnaPlan, getEditdnaPlan } from "@/server/editdna";
import { assertUuid, route } from "@/server/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = route<{ id: string }>(async (req, { id }) => {
  const ctx = await requireOwner(req);
  const row = await getEditdnaPlan(ctx.db, ctx.child.id, assertUuid(id));
  return json({ item: row });
});

export const DELETE = route<{ id: string }>(async (req, { id }) => {
  const ctx = await requireOwner(req, { write: true });
  await deleteEditdnaPlan(ctx.db, ctx.child.id, ctx.user.id, assertUuid(id));
  return json({ ok: true });
});