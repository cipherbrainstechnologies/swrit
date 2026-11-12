import { eq } from "drizzle-orm";
import { NO_STORE, rateLimit, requireOwner } from "@/server/access";
import { audit } from "@/server/audit";
import { schema } from "@/server/db";
import { route } from "@/server/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Metadata manifest (JSON) for the whole archive: dates, captions, albums, films
 * and SHA-256 checksums. Original binaries are exported with `pnpm export:heirloom`,
 * which writes files + this manifest + a checksum list to a local folder.
 */
export const GET = route(async (req) => {
  const ctx = await requireOwner(req);
  await rateLimit(ctx.db, `export:${ctx.user.id}`, 10, 3600);
  const media = await ctx.db.select().from(schema.media).where(eq(schema.media.childId, ctx.child.id));
  const albums = await ctx.db.select().from(schema.albums).where(eq(schema.albums.childId, ctx.child.id));
  const albumMedia = albums.length
    ? await ctx.db.select().from(schema.albumMedia)
    : [];
  const films = await ctx.db.select().from(schema.birthdayFilms).where(eq(schema.birthdayFilms.childId, ctx.child.id));
  const albumIds = new Set(albums.map((a) => a.id));
  const manifest = {
    format: "dear-swritsinh-heirloom-manifest/1",
    exportedAt: new Date().toISOString(),
    child: {
      fullName: ctx.child.fullName,
      preferredName: ctx.child.preferredName,
      birthDate: ctx.child.birthDate,
      birthDateConfirmed: ctx.child.birthDateConfirmed,
      timezone: ctx.child.timezone,
    },
    media: media.map((m) => ({
      id: m.id,
      filename: m.filenameOriginal,
      kind: m.kind,
      mime: m.mimeDetected,
      bytes: m.bytes,
      sha256: m.sha256,
      capturedAt: m.capturedAt?.toISOString() ?? null,
      capturedSource: m.capturedSource,
      capturedConfidence: m.capturedConfidence,
      caption: m.caption,
      story: m.story,
      favorite: m.favorite,
      isLegacyFilm: m.isLegacyFilm,
      deleted: !!m.deletedAt,
    })),
    albums: albums.map((a) => ({
      id: a.id,
      name: a.name,
      description: a.description,
      mediaIds: albumMedia.filter((x) => x.albumId === a.id && albumIds.has(a.id)).map((x) => x.mediaId),
    })),
    films: films.map((f) => ({
      id: f.id,
      title: f.title,
      source: f.source,
      sourceMediaId: f.sourceMediaId,
      birthdayAge: f.birthdayAge,
      status: f.status,
      renderedMeta: f.renderedMeta,
    })),
  };
  await audit(ctx.user.id, "archive.manifest_exported", "child", ctx.child.id, { media: media.length });
  return new Response(JSON.stringify(manifest, null, 2), {
    headers: {
      ...NO_STORE,
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="dear-swritsinh-manifest-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
});
