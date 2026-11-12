import { json, requireOwner } from "@/server/access";
import { readJson, route } from "@/server/http";
import { initUpload, initSchema } from "@/server/uploads";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const POST = route(async (req) => {
  const ctx = await requireOwner(req, { write: true });
  const input = initSchema.parse(await readJson(req, 2 * 1024 * 1024));
  return json(await initUpload(ctx, input));
});
