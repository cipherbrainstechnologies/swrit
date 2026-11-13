import { and, eq, inArray, isNull } from "drizzle-orm";
import { z } from "zod";
import { HttpError, json, rateLimit, requireOwner } from "@/server/access";
import { schema } from "@/server/db";
import { readJson, route } from "@/server/http";
import { createStudioProject } from "@/server/studio";
import { analyzeLibrary, buildPostPrompt, EDIT_PATTERNS, isPostPlatform, planShotTiming, type LibraryShot } from "@/studio/post-cut";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const body = z.object({
  hook: z.string().trim().min(1).max(80),
  theme: z.string().trim().min(1).max(240),
  platform: z.string().trim().min(1).max(80),
  mediaIds: z.array(z.string().uuid()).min(1).max(12),
  patternIds: z.array(z.string()).max(10),
  captions: z.array(z.object({ mediaId: z.string().uuid(), text: z.string().max(120) })).max(12),
}).strict();

export const POST = route(async (req) => {
  const ctx = await requireOwner(req, { write: true });
  await rateLimit(ctx.db, `studio:${ctx.user.id}`, 20, 3600);
  const input = body.parse(await readJson(req, 64 * 1024));
  if (!isPostPlatform(input.platform)) {
    throw new HttpError(400, "platform_required", "Choose Instagram Reels, YouTube Shorts, or TikTok before the cut is created.");
  }
  const known = new Set(EDIT_PATTERNS.map((pattern) => pattern.id));
  const patternIds = input.patternIds.filter((id) => known.has(id));
  const rows = await ctx.db
    .select()
    .from(schema.media)
    .where(and(eq(schema.media.childId, ctx.child.id), isNull(schema.media.deletedAt), inArray(schema.media.id, input.mediaIds)));
  const byId = new Map(rows.map((row) => [row.id, row]));
  const shots: LibraryShot[] = [];
  for (const id of input.mediaIds) {
    const row = byId.get(id);
    if (!row || row.status === "duplicate" || row.status === "failed" || (row.kind !== "image" && row.kind !== "video")) continue;
    shots.push({ mediaId: row.id, kind: row.kind, durationMs: row.durationMs, caption: row.caption });
  }
  if (!shots.length) throw new HttpError(400, "no_media", "Select photographs or videos from your library.");
  const analysis = analyzeLibrary(shots);
  const timing = planShotTiming({ shots, patternIds, captions: input.captions });
  const prompt = buildPostPrompt({ theme: input.theme, platform: input.platform, patternIds, analysis });
  const project = await createStudioProject(ctx.db, ctx.child, ctx.user.id, {
    title: input.hook,
    prompt,
    pipeline: "cinematic",
    profile: input.platform,
    mediaIds: shots.map((shot) => shot.mediaId),
    shots: timing,
  });
  return json({ id: project.id, engine: analysis.engine, analysis }, 201);
});
