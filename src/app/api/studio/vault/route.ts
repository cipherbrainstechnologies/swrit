import { json, requireOwner } from "@/server/access";
import { listStudioExportVault } from "@/server/studio";
import { route } from "@/server/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = route(async (req) => {
  const ctx = await requireOwner(req);
  const profile = new URL(req.url).searchParams.get("profile") ?? undefined;
  const rows = await listStudioExportVault(ctx.db, ctx.child.id, { profile });
  return json({
    items: rows.map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
    })),
  });
});