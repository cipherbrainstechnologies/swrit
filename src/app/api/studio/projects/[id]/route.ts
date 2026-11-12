import { z } from "zod";
import { HttpError, json, requireOwner } from "@/server/access";
import { deleteStudioExport, getStudioProject, updateStudioScenes } from "@/server/studio";
import { assertUuid, readJson, route } from "@/server/http";
import { getStorage } from "@/server/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = route<{ id: string }>(async (req, { id }) => {
  const ctx = await requireOwner(req);
  return json(await getStudioProject(ctx.db, ctx.child.id, assertUuid(id)));
});

const patch = z.object({
  scenes: z.array(z.object({
    id: z.string().uuid(),
    caption: z.string().max(500).optional(),
    durationSeconds: z.number().min(1).max(30).optional(),
    omitted: z.boolean().optional(),
    hero: z.boolean().optional(),
    position: z.number().int().min(0).max(20000).optional(),
  })).max(20000),
}).strict();

export const DELETE = route<{ id: string }>(async (req, { id }) => {
  const ctx = await requireOwner(req, { write: true });
  const exportId = new URL(req.url).searchParams.get("export");
  if (!exportId) throw new HttpError(404, "not_found", "Export not found.");
  const storage = await getStorage();
  return json(await deleteStudioExport(ctx.db, ctx.child.id, assertUuid(id), assertUuid(exportId), (key) => storage.delete(key)));
});

export const PATCH = route<{ id: string }>(async (req, { id }) => {
  const ctx = await requireOwner(req, { write: true });
  const input = patch.parse(await readJson(req, 1024 * 1024));
  return json(await updateStudioScenes(ctx.db, ctx.child.id, assertUuid(id), input.scenes));
});
