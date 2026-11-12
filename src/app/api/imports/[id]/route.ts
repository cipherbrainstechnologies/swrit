import { and, eq } from "drizzle-orm";
import { HttpError, json, requireOwner } from "@/server/access";
import { schema } from "@/server/db";
import { assertUuid, route } from "@/server/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = route<{ id: string }>(async (req, { id }) => {
  const ctx = await requireOwner(req);
  const r = (
    await ctx.db
      .select()
      .from(schema.imports)
      .where(and(eq(schema.imports.id, assertUuid(id)), eq(schema.imports.childId, ctx.child.id)))
      .limit(1)
  )[0];
  if (!r) throw new HttpError(404, "not_found", "Import not found.");
  return json({
    import: {
      id: r.id,
      label: r.sourceLabel,
      status: r.status,
      entriesTotal: r.entriesTotal,
      accepted: r.accepted,
      duplicates: r.duplicates,
      rejected: r.rejected,
      errors: r.errors.slice(0, 100),
      progress: r.progress,
      createdAt: r.createdAt.toISOString(),
      finishedAt: r.finishedAt?.toISOString() ?? null,
    },
  });
});
