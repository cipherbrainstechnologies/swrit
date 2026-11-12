import { and, asc, desc, eq, inArray, isNull } from "drizzle-orm";
import { validateSkill } from "../cinema/skill";
import { buildFilmPlan, CLOSING_LINES, OPENING_LINES, type FilmPlan } from "../film/plan";
import { defaultFinaleSeconds } from "../film/melody";
import { birthdayInYear, parseYMD } from "../lib/dates";
import { HttpError, type Child } from "./access";
import { schema, type DB } from "./db";

export type Film = typeof schema.birthdayFilms.$inferSelect;

export const FIVE_YEARS_ALBUM = "Our First Five Years";
export const FAMILY_ALBUM = "Family & Love";

export async function ensureAlbum(
  db: DB,
  childId: string,
  name: string,
  description?: string,
): Promise<typeof schema.albums.$inferSelect> {
  const existing = await db
    .select()
    .from(schema.albums)
    .where(and(eq(schema.albums.childId, childId), eq(schema.albums.name, name)))
    .limit(1);
  if (existing[0]) return existing[0];
  const [a] = await db
    .insert(schema.albums)
    .values({ childId, name, description: description ?? null })
    .onConflictDoNothing()
    .returning();
  return a ?? (await ensureAlbum(db, childId, name, description));
}

/** The editable draft for a given birthday age (created on first visit, never auto-published). */
export async function ensureBirthdayFilm(db: DB, child: Child, age: number): Promise<Film> {
  const birth = parseYMD(child.birthDate);
  const year = birth.y + age;
  const existing = await db
    .select()
    .from(schema.birthdayFilms)
    .where(
      and(
        eq(schema.birthdayFilms.childId, child.id),
        eq(schema.birthdayFilms.birthdayAge, age),
        eq(schema.birthdayFilms.source, "slideshow"),
      ),
    )
    .orderBy(asc(schema.birthdayFilms.createdAt))
    .limit(1);
  if (existing[0]) return existing[0];
  const [f] = await db
    .insert(schema.birthdayFilms)
    .values({
      childId: child.id,
      birthdayAge: age,
      birthdayYear: year,
      title: `${child.preferredName}'s ${ordinal(age)} Birthday`,
      source: "slideshow",
      status: "draft",
      openingTitle: OPENING_LINES,
      closingTitle: CLOSING_LINES,
      coverMediaId: child.coverMediaId,
    })
    .returning();
  return f;
}

export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] ?? s[v] ?? s[0]}`;
}

export async function getOwnedFilm(db: DB, childId: string, filmId: string): Promise<Film> {
  const rows = await db
    .select()
    .from(schema.birthdayFilms)
    .where(and(eq(schema.birthdayFilms.id, filmId), eq(schema.birthdayFilms.childId, childId)))
    .limit(1);
  if (!rows[0]) throw new HttpError(404, "not_found", "Film not found.");
  return rows[0];
}

export async function listFilms(db: DB, childId: string) {
  return db
    .select()
    .from(schema.birthdayFilms)
    .where(eq(schema.birthdayFilms.childId, childId))
    .orderBy(desc(schema.birthdayFilms.createdAt));
}

export type FilmData = {
  film: Film;
  plan: FilmPlan;
  media: Record<string, { id: string; width: number | null; height: number | null; caption: string | null; capturedAt: string | null }>;
  audio: { mediaId: string; durationMs: number | null; rightsConfirmed: boolean } | null;
};

/** Build the plan for a slideshow film from current media + studio overrides. */
export async function filmData(db: DB, child: Child, film: Film): Promise<FilmData> {
  if (film.source !== "slideshow") throw new HttpError(400, "not_slideshow", "This film is an imported video.");
  const skillRow = film.skillVersionId
    ? (await db.select().from(schema.cinemaSkillVersions).where(eq(schema.cinemaSkillVersions.id, film.skillVersionId)).limit(1))[0]
    : undefined;
  const skill = skillRow ? validateSkill(skillRow.manifest) : null;
  const manifest = skill?.ok ? skill.skill : null;
  const items = await db
    .select()
    .from(schema.media)
    .where(and(eq(schema.media.childId, child.id), isNull(schema.media.deletedAt), inArray(schema.media.kind, ["image", "video"])));
  const scenes = await db.select().from(schema.filmScenes).where(eq(schema.filmScenes.filmId, film.id));
  const override = new Map(scenes.filter((s) => s.mediaId).map((s) => [s.mediaId!, s]));

  const albumRows = await db
    .select({ albumName: schema.albums.name, mediaId: schema.albumMedia.mediaId })
    .from(schema.albumMedia)
    .innerJoin(schema.albums, eq(schema.albums.id, schema.albumMedia.albumId))
    .where(and(eq(schema.albums.childId, child.id), inArray(schema.albums.name, [FIVE_YEARS_ALBUM, FAMILY_ALBUM])));
  const inFive = new Set(albumRows.filter((r) => r.albumName === FIVE_YEARS_ALBUM).map((r) => r.mediaId));
  const inFamily = new Set(albumRows.filter((r) => r.albumName === FAMILY_ALBUM).map((r) => r.mediaId));

  let audio: FilmData["audio"] = null;
  if (film.audioMediaId) {
    const a = (await db.select().from(schema.media).where(and(eq(schema.media.id, film.audioMediaId), eq(schema.media.childId, child.id))).limit(1))[0];
    if (a && !a.deletedAt) audio = { mediaId: a.id, durationMs: a.durationMs, rightsConfirmed: film.audioRightsConfirmed };
  }

  const birth = parseYMD(child.birthDate);
  const bday = birthdayInYear(birth, film.birthdayYear ?? birth.y + (film.birthdayAge ?? 5));
  const cutoff = new Date(`${bday.y}-${String(bday.m).padStart(2, "0")}-${String(bday.d).padStart(2, "0")}T23:59:59+05:30`);

  const plan = buildFilmPlan(
    items.map((m) => {
      const o = override.get(m.id);
      const caption = o?.captions?.[0]?.text ?? m.caption;
      return {
        id: m.id,
        kind: m.kind,
        capturedAt: m.capturedAt,
        dateNeedsReview: m.dateNeedsReview,
        favorite: m.favorite,
        caption,
        width: m.width,
        height: m.height,
        status: m.status,
        pinned: o?.pinned || inFive.has(m.id),
        omitted: o?.omitted ?? false,
        family: inFamily.has(m.id),
        order: o?.order ?? null,
      };
    }),
    {
      birthDate: child.birthDate,
      timeZone: child.timezone,
      cutoff,
      targetSeconds: film.durationTargetSeconds,
      songSeconds: audio?.durationMs ? audio.durationMs / 1000 : defaultFinaleSeconds(),
      openingLines: film.openingTitle ?? OPENING_LINES,
      closingLines: film.closingTitle ?? CLOSING_LINES,
      openingSeconds: manifest?.opening.seconds,
      closingSeconds: manifest?.closing.seconds,
      coverMediaId: film.coverMediaId ?? child.coverMediaId,
      chapters: manifest?.chapters,
      excludeDuplicates: manifest?.selection.deduplicate ?? false,
      includeVideos: manifest?.selection.includeVideoStills ?? false,
      colorGrade: manifest?.color.grade,
      manualOrder: !!manifest && scenes.some((s) => s.order != null),
    },
  );
  const used = new Set(plan.scenes.flatMap((s) => (s.type === "photo" ? [s.mediaId] : [])));
  const media: FilmData["media"] = {};
  for (const m of items) {
    if (used.has(m.id) || m.id === (film.coverMediaId ?? child.coverMediaId)) {
      media[m.id] = {
        id: m.id,
        width: m.width,
        height: m.height,
        caption: m.caption,
        capturedAt: m.capturedAt?.toISOString() ?? null,
      };
    }
  }
  return { film, plan, media, audio };
}

/** Albums the birthday experience relies on. Created empty; the parent fills them. */
export async function ensureDefaultAlbums(db: DB, childId: string) {
  await ensureAlbum(db, childId, FIVE_YEARS_ALBUM, "Photos you choose for the fifth-birthday film. They are always included.");
  await ensureAlbum(db, childId, FAMILY_ALBUM, "Photos with the people who love him. They form the “Family & Love” chapter.");
}
