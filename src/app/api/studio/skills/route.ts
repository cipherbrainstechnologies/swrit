import { eq } from "drizzle-orm";
import { z } from "zod";
import { json, requireOwner } from "@/server/access";
import { schema } from "@/server/db";
import { readJson, route } from "@/server/http";
import { saveStudioSkill } from "@/server/studio";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = route(async (req) => {
  const ctx = await requireOwner(req);
  const skills = await ctx.db.select().from(schema.studioSkills).where(eq(schema.studioSkills.childId, ctx.child.id));
  return json({ skills });
});

const body = z.object({
  sourceName: z.string().trim().min(1).max(180),
  markdown: z.boolean().optional(),
  body: z.string().min(2).max(200_000),
}).strict();

export const POST = route(async (req) => {
  const ctx = await requireOwner(req, { write: true });
  const input = body.parse(await readJson(req, 256 * 1024));
  const saved = await saveStudioSkill(ctx.db, ctx.child.id, input.sourceName, input.body, Boolean(input.markdown));
  return json({ id: saved.skill.id, title: saved.skill.title, notice: saved.notice }, 201);
});
