import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { json, rateLimit, requireOwner } from "@/server/access";
import { schema } from "@/server/db";
import { readJson, route } from "@/server/http";
import { createStudioProject } from "@/server/studio";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = route(async (req) => {
  const ctx = await requireOwner(req);
  const projects = await ctx.db.select().from(schema.studioProjects).where(eq(schema.studioProjects.childId, ctx.child.id)).orderBy(desc(schema.studioProjects.createdAt));
  return json({
    projects: projects.map((project) => ({
      id: project.id,
      title: project.title,
      pipeline: project.pipeline,
      profile: project.profile,
      stage: project.stage,
      createdAt: project.createdAt,
    })),
  });
});

const body = z.object({
  title: z.string().trim().min(1).max(160),
  prompt: z.string().trim().min(1).max(4000),
  pipeline: z.string().trim().min(1).max(80).optional(),
  profile: z.string().trim().min(1).max(80),
  mediaIds: z.array(z.string().uuid()).max(20000).optional(),
  albumId: z.string().uuid().optional(),
  allReady: z.boolean().optional(),
  acknowledgeLarge: z.boolean().optional(),
  musicMediaId: z.string().uuid().optional(),
  referenceUrl: z.string().trim().max(2000).optional(),
}).strict();

export const POST = route(async (req) => {
  const ctx = await requireOwner(req, { write: true });
  await rateLimit(ctx.db, `studio:${ctx.user.id}`, 20, 3600);
  const input = body.parse(await readJson(req, 512 * 1024));
  const project = await createStudioProject(ctx.db, ctx.child, ctx.user.id, input);
  return json({ id: project.id, stage: project.stage }, 201);
});
