import { json, requireOwner } from "@/server/access";
import { readJson, route } from "@/server/http";
import { presignParts, partSchema } from "@/server/uploads";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const POST = route(async (req) => {
  const ctx = await requireOwner(req, { write: true });
  const input = partSchema.parse(await readJson(req, 2 * 1024 * 1024));
  return json(await presignParts(ctx, input));
});
