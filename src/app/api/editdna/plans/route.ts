import { z } from "zod";
import { json, requireOwner } from "@/server/access";
import { createEditdnaPlan, listEditdnaPlans } from "@/server/editdna";
import { readJson, route } from "@/server/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = route(async (req) => {
  const ctx = await requireOwner(req);
  const rows = await listEditdnaPlans(ctx.db, ctx.child.id);
  return json({
    items: rows.map((row) => ({
      id: row.id,
      title: row.title,
      templateId: row.templateId,
      notes: row.notes,
      createdAt: row.createdAt.toISOString(),
      edl: row.edl,
    })),
  });
});

const postBody = z
  .object({
    edl: z.unknown(),
    templateId: z.string().uuid().nullable().optional(),
    notes: z.string().max(2000).optional(),
  })
  .strict();

export const POST = route(async (req) => {
  const ctx = await requireOwner(req, { write: true });
  const body = postBody.parse(await readJson(req));
  const row = await createEditdnaPlan(ctx.db, ctx.child.id, ctx.user.id, body.edl, body.templateId, body.notes);
  return json({ item: row }, 201);
});