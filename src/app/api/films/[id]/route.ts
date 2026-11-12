import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { HttpError, json, requireOwner } from "@/server/access";
import { audit } from "@/server/audit";
import { schema } from "@/server/db";
import { filmData, getOwnedFilm } from "@/server/films";
import { assertUuid, readJson, route } from "@/server/http";
import { getOwnedMedia } from "@/server/media/queries";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Film plan for the Theatre / Studio. */
export const GET = route<{ id: string }>(async (req, { id }) => {
  const ctx = await requireOwner(req);
  const film = await getOwnedFilm(ctx.db, ctx.child.id, assertUuid(id));
  if (film.source === "imported") {
    return json({ film: { id: film.id, title: film.title, source: film.source, sourceMediaId: film.sourceMediaId } });
  }
  const data = await filmData(ctx.db, ctx.child, film);
  return json({
    film: {
      id: film.id,
      title: film.title,
      source: film.source,
      status: film.status,
      openingTitle: film.openingTitle,
      closingTitle: film.closingTitle,
      durationTargetSeconds: film.durationTargetSeconds,
      hasRender: !!film.renderedStorageKey,
      renderedMeta: film.renderedMeta,
    },
    plan: data.plan,
    media: data.media,
    audio: data.audio,
  });
});

const lines = z.array(z.string().max(120)).min(1).max(5);
const patch = z
  .object({
    title: z.string().min(1).max(120).optional(),
    openingTitle: lines.optional(),
    closingTitle: lines.optional(),
    durationTargetSeconds: z.number().int().min(45).max(600).optional(),
    coverMediaId: z.string().uuid().nullable().optional(),
    audioMediaId: z.string().uuid().nullable().optional(),
    audioRightsConfirmed: z.boolean().optional(),
    approve: z.boolean().optional(),
    scenes: z
      .array(
        z.object({
          mediaId: z.string().uuid(),
          pinned: z.boolean().optional(),
          omitted: z.boolean().optional(),
          caption: z.string().max(200).nullable().optional(),
          order: z.number().int().min(0).max(100000).nullable().optional(),
        }),
      )
      .max(500)
      .optional(),
  })
  .strict();

export const PATCH = route<{ id: string }>(async (req, { id }) => {
  const ctx = await requireOwner(req, { write: true });
  const film = await getOwnedFilm(ctx.db, ctx.child.id, assertUuid(id));
  const b = patch.parse(await readJson(req, 256 * 1024));
  const set: Partial<typeof schema.birthdayFilms.$inferInsert> = { updatedAt: new Date() };
  if (b.title) set.title = b.title;
  if (b.openingTitle) set.openingTitle = b.openingTitle;
  if (b.closingTitle) set.closingTitle = b.closingTitle;
  if (b.durationTargetSeconds) set.durationTargetSeconds = b.durationTargetSeconds;
  if (b.coverMediaId !== undefined) {
    if (b.coverMediaId) await getOwnedMedia(ctx.db, ctx.child.id, b.coverMediaId);
    set.coverMediaId = b.coverMediaId;
  }
  if (b.audioMediaId !== undefined) {
    if (b.audioMediaId) {
      const a = await getOwnedMedia(ctx.db, ctx.child.id, b.audioMediaId);
      if (a.kind !== "audio") throw new HttpError(400, "not_audio", "Choose an audio file.");
    }
    set.audioMediaId = b.audioMediaId;
    if (!b.audioMediaId) set.audioRightsConfirmed = false;
  }
  if (b.audioRightsConfirmed !== undefined) set.audioRightsConfirmed = b.audioRightsConfirmed;
  // Any edit returns the film to draft; approval is an explicit parent action.
  set.status = b.approve ? "approved" : film.status === "rendering" ? "rendering" : "draft";
  await ctx.db.update(schema.birthdayFilms).set(set).where(eq(schema.birthdayFilms.id, film.id));

  for (const s of b.scenes ?? []) {
    await getOwnedMedia(ctx.db, ctx.child.id, s.mediaId);
    const existing = await ctx.db
      .select()
      .from(schema.filmScenes)
      .where(and(eq(schema.filmScenes.filmId, film.id), eq(schema.filmScenes.mediaId, s.mediaId)))
      .limit(1);
    const values = {
      pinned: s.pinned ?? existing[0]?.pinned ?? false,
      omitted: s.omitted ?? existing[0]?.omitted ?? false,
      captions:
        s.caption === undefined
          ? (existing[0]?.captions ?? [])
          : s.caption
            ? [{ text: s.caption.trim() }]
            : [],
      order: s.order ?? existing[0]?.order ?? 0,
    };
    if (existing[0]) await ctx.db.update(schema.filmScenes).set(values).where(eq(schema.filmScenes.id, existing[0].id));
    else await ctx.db.insert(schema.filmScenes).values({ filmId: film.id, mediaId: s.mediaId, ...values });
  }
  await audit(ctx.user.id, "film.updated", "film", film.id, { fields: Object.keys(b) });
  return json({ ok: true });
});
