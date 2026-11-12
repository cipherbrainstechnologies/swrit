import { json, requireOwner } from "@/server/access";
import { cancelStudioProject } from "@/server/studio";
import { assertUuid, route } from "@/server/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const POST = route<{ id: string }>(async (req, { id }) => {
  const ctx = await requireOwner(req, { write: true });
  return json(await cancelStudioProject(ctx.db, ctx.child.id, assertUuid(id)));
});
