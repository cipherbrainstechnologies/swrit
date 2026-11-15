import { z } from "zod";
import { json, requireOwner } from "@/server/access";
import { createEditdnaTemplate, listEditdnaTemplates, seedSampleTemplate } from "@/server/editdna";
import { readJson, route } from "@/server/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = route(async (req) => {
  const ctx = await requireOwner(req);
  const rows = await listEditdnaTemplates(ctx.db, ctx.child.id);
  return json({
    items: rows.map((row) => ({
      id: row.id,
      name: row.name,
      sourceLabel: row.sourceLabel,
      createdAt: row.createdAt.toISOString(),
      manifest: row.manifest,
    })),
  });
});

const postBody = z
  .object({
    manifest: z.unknown(),
    sourceLabel: z.string().max(500).optional(),
    seedSample: z.literal(true).optional(),
  })
  .strict();

export const POST = route(async (req) => {
  const ctx = await requireOwner(req, { write: true });
  const body = postBody.parse(await readJson(req));
  if (body.seedSample) {
    const row = await seedSampleTemplate(ctx.db, ctx.child.id, ctx.user.id);
    return json({ item: row }, 201);
  }
  const row = await createEditdnaTemplate(ctx.db, ctx.child.id, ctx.user.id, body.manifest, body.sourceLabel);
  return json({ item: row }, 201);
});