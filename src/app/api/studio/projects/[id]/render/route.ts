import { z } from "zod";
import { json, rateLimit, requireOwner } from "@/server/access";
import { enqueueStudioRender } from "@/server/studio";
import { assertUuid, readJson, route } from "@/server/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const body = z.object({ profile: z.string().trim().min(1).max(80).optional() }).strict();

export const POST = route<{ id: string }>(async (req, { id }) => {
  const ctx = await requireOwner(req, { write: true });
  await rateLimit(ctx.db, `studio-render:${ctx.user.id}`, 10, 3600);
  const input = body.parse(await readJson(req));
  return json(await enqueueStudioRender(ctx.db, ctx.child.id, ctx.user.id, assertUuid(id), input.profile), 202);
});
