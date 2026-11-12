import { and, eq } from "drizzle-orm";
import { HttpError, NO_STORE, requireOwner } from "@/server/access";
import { schema } from "@/server/db";
import { env } from "@/server/env";
import { assertUuid, route } from "@/server/http";
import { getStorage } from "@/server/storage";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = route<{ id: string }>(async (req, { id }) => {
  const ctx = await requireOwner(req);
  const projectId = assertUuid(id);
  const exportId = new URL(req.url).searchParams.get("export");
  if (!exportId) throw new HttpError(404, "not_found", "Export not found.");
  const [row] = await ctx.db
    .select({ exp: schema.studioExports, project: schema.studioProjects })
    .from(schema.studioExports)
    .innerJoin(schema.studioProjects, eq(schema.studioProjects.id, schema.studioExports.projectId))
    .where(and(eq(schema.studioExports.id, assertUuid(exportId)), eq(schema.studioProjects.id, projectId), eq(schema.studioProjects.childId, ctx.child.id)))
    .limit(1);
  if (!row?.exp.storageKey || row.exp.status !== "ready") throw new HttpError(404, "not_rendered", "This export is not ready.");
  const download = new URL(req.url).searchParams.get("download") === "1";
  const storage = await getStorage();
  const url = await storage.presignGet(row.exp.storageKey, Math.max(env().MEDIA_SIGNED_URL_TTL_SECONDS, 600), {
    contentType: "video/mp4",
    downloadName: download ? `${row.project.title.replace(/[^a-z0-9 _-]/gi, "").trim() || "production"}.mp4` : undefined,
  });
  return new Response(null, { status: 302, headers: { Location: url, ...NO_STORE, "Referrer-Policy": "no-referrer" } });
});
