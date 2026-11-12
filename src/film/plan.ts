/**
 * Film plan shared by the browser Birthday Theatre and the server-side renderer.
 * Pure functions: no database or DOM access.
 *
 * Honesty rules: chapter cards describe *ages* (derived from verified dates), never
 * invented events. On-photo captions come only from what the parent wrote.
 */

import { ageInMonths } from "../lib/dates";

export const OPENING_LINES = ["DEAR SWRITSINH", "Five Years of Love", "A little life. A million beautiful memories."];
export const CLOSING_LINES = [
  "HAPPY 5TH BIRTHDAY",
  "SWRITSINH CHAUHAN",
  "Keep smiling. Keep dreaming. Keep shining.",
  "With endless love, Mom & Dad.",
];

export type PlanMedia = {
  id: string;
  kind: "image" | "video" | "audio";
  capturedAt: string | Date | null;
  dateNeedsReview: boolean;
  favorite: boolean;
  caption: string | null;
  width: number | null;
  height: number | null;
  status: string;
  pinned?: boolean;
  omitted?: boolean;
  family?: boolean;
  /** Explicit order from the studio (lower first). */
  order?: number | null;
};

export type Chapter = { key: string; title: string; subtitle: string };

export const CHAPTERS: Chapter[] = [
  { key: "beginning", title: "The Beginning", subtitle: "His first year" },
  { key: "wonders", title: "Little Moments, Big Wonders", subtitle: "One and two" },
  { key: "family", title: "Family & Love", subtitle: "The people who love him" },
  { key: "growing", title: "Growing Up", subtitle: "Two and three" },
  { key: "explorer", title: "Our Little Explorer", subtitle: "Four, nearly five" },
];

export type Scene =
  | { type: "opening"; start: number; duration: number; lines: string[]; coverMediaId?: string | null }
  | { type: "chapter"; start: number; duration: number; chapter: Chapter }
  | {
      type: "photo";
      start: number;
      duration: number;
      mediaId: string;
      chapterKey: string;
      caption: string | null;
      portrait: boolean;
      motion: "in" | "out" | "left" | "right";
    }
  | { type: "closing"; start: number; duration: number; lines: string[]; coverMediaId?: string | null };

export type FilmPlan = {
  scenes: Scene[];
  totalSeconds: number;
  /** When the birthday song should begin so that it finishes with the film. */
  finaleStartSeconds: number;
  photoCount: number;
  skippedUndated: number;
  colorGrade?: "warm-natural" | "none";
};

export type SkillChapter = {
  key: string;
  title: string;
  subtitle: string;
  fromMonths: number;
  toMonths: number;
};

export type PlanOptions = {
  birthDate: string;
  timeZone: string;
  /** Last instant to include (the birthday, end of day). */
  cutoff: Date;
  targetSeconds?: number;
  songSeconds?: number;
  openingLines?: string[];
  closingLines?: string[];
  openingSeconds?: number;
  closingSeconds?: number;
  coverMediaId?: string | null;
  /** When true, use `order` instead of chronological sampling (studio edits). */
  manualOrder?: boolean;
  /** Age-band chapters from an approved cinema skill. Omitted chapters keep the built-in birthday film. */
  chapters?: SkillChapter[];
  /** Drop media already marked duplicate. Originals stay in the library. */
  excludeDuplicates?: boolean;
  /** Hold a frame from eligible videos in the same cut as photographs. */
  includeVideos?: boolean;
  colorGrade?: "warm-natural" | "none";
};

const OPENING_SECONDS = 9;
const CHAPTER_SECONDS = 3;
const MIN_PHOTO = 3.2;
const BASE_PHOTO = 4.2;
const MAX_PHOTO = 7;

export function chapterKeyFor(months: number): string {
  if (months < 12) return "beginning";
  if (months < 30) return "wonders";
  if (months < 48) return "growing";
  return "explorer";
}

function chapterKeyFromSkill(chapters: SkillChapter[], months: number): string {
  const hit = chapters.find((c) => c.key !== "family" && months >= c.fromMonths && months < c.toMonths);
  return hit?.key ?? chapters.find((c) => c.key !== "family")?.key ?? chapters[0].key;
}

function evenlySample<T>(items: T[], n: number): T[] {
  if (n >= items.length) return items;
  if (n <= 0) return [];
  const out: T[] = [];
  const step = items.length / n;
  for (let i = 0; i < n; i++) out.push(items[Math.floor(i * step + step / 2)]);
  return out;
}

export function buildFilmPlan(all: PlanMedia[], o: PlanOptions): FilmPlan {
  const target = o.targetSeconds ?? 180;
  const song = Math.max(8, Math.min(90, o.songSeconds ?? 24));
  const usable = all.filter(
    (m) =>
      (m.kind === "image" || (o.includeVideos && m.kind === "video")) &&
      !m.omitted &&
      (m.status === "ready" || m.status === "duplicate") &&
      !(o.excludeDuplicates && m.status === "duplicate"),
  );
  const dated = usable.filter((m) => m.capturedAt && (!m.dateNeedsReview || m.pinned));
  const skippedUndated = usable.length - dated.length;

  const withTime = dated
    .map((m) => ({ m, t: new Date(m.capturedAt as string | Date) }))
    .filter(({ t }) => t.getTime() <= o.cutoff.getTime())
    .sort((a, b) => a.t.getTime() - b.t.getTime());

  // Group by chapter (age band). Parent-marked family photos form their own chapter.
  const chapterDefs: SkillChapter[] = o.chapters?.length
    ? o.chapters
    : [
        { key: "beginning", title: "The Beginning", subtitle: "His first year", fromMonths: 0, toMonths: 12 },
        { key: "wonders", title: "Little Moments, Big Wonders", subtitle: "One and two", fromMonths: 12, toMonths: 30 },
        { key: "family", title: "Family & Love", subtitle: "The people who love him", fromMonths: 0, toMonths: 0 },
        { key: "growing", title: "Growing Up", subtitle: "Two and three", fromMonths: 30, toMonths: 48 },
        { key: "explorer", title: "Our Little Explorer", subtitle: "Four, nearly five", fromMonths: 48, toMonths: 1200 },
      ];
  const groups = new Map<string, { m: PlanMedia; t: Date }[]>();
  for (const c of chapterDefs) groups.set(c.key, []);
  const hasFamily = chapterDefs.some((c) => c.key === "family");
  for (const item of withTime) {
    const key =
      item.m.family && hasFamily
        ? "family"
        : o.chapters?.length
          ? chapterKeyFromSkill(chapterDefs, ageInMonths(o.birthDate, item.t, o.timeZone))
          : chapterKeyFor(ageInMonths(o.birthDate, item.t, o.timeZone));
    (groups.get(key) ?? groups.get(chapterDefs[0].key)!).push(item);
  }
  const activeChapters = chapterDefs
    .filter((c) => (groups.get(c.key)?.length ?? 0) > 0)
    .map((c) => ({ key: c.key, title: c.title, subtitle: c.subtitle }));

  const openingSeconds = o.openingSeconds ?? OPENING_SECONDS;
  const closingSeconds = o.closingSeconds ?? Math.max(12, Math.min(song, 30));
  const fixed = openingSeconds + closingSeconds + activeChapters.length * CHAPTER_SECONDS;
  const photoBudget = Math.max(0, target - fixed);
  const maxPhotos = Math.max(activeChapters.length, Math.floor(photoBudget / BASE_PHOTO));
  const totalAvailable = withTime.length;

  // Allocate photo slots per chapter proportionally, always keeping pinned items.
  const chosen = new Map<string, { m: PlanMedia; t: Date }[]>();
  for (const c of activeChapters) {
    const items = groups.get(c.key)!;
    const share = totalAvailable ? Math.max(1, Math.round((items.length / totalAvailable) * maxPhotos)) : 0;
    const pinned = items.filter((i) => i.m.pinned);
    const favs = items.filter((i) => !i.m.pinned && i.m.favorite);
    const rest = items.filter((i) => !i.m.pinned && !i.m.favorite);
    let picks = [...pinned];
    if (picks.length < share) picks.push(...evenlySample(favs, share - picks.length));
    if (picks.length < share) picks.push(...evenlySample(rest, share - picks.length));
    picks = o.manualOrder
      ? picks.sort((a, b) => (a.m.order ?? 1e9) - (b.m.order ?? 1e9) || a.t.getTime() - b.t.getTime())
      : picks.sort((a, b) => a.t.getTime() - b.t.getTime());
    chosen.set(c.key, picks);
  }

  const photoTotal = [...chosen.values()].reduce((n, l) => n + l.length, 0);
  const weights = [...chosen.values()].flat().reduce((w, i) => w + (i.m.pinned || i.m.favorite ? 1.33 : 1), 0);
  const perWeight = photoTotal ? Math.min(MAX_PHOTO, Math.max(MIN_PHOTO, photoBudget / weights)) : 0;

  const scenes: Scene[] = [];
  let t = 0;
  type NoStart<T> = T extends unknown ? Omit<T, "start"> : never;
  const push = (s: NoStart<Scene>) => {
    scenes.push({ ...s, start: Number(t.toFixed(3)) } as Scene);
    t += s.duration;
  };
  push({ type: "opening", duration: openingSeconds, lines: o.openingLines ?? OPENING_LINES, coverMediaId: o.coverMediaId ?? null });
  const motions = ["in", "out", "left", "right"] as const;
  let k = 0;
  for (const c of activeChapters) {
    push({ type: "chapter", duration: CHAPTER_SECONDS, chapter: c });
    for (const { m } of chosen.get(c.key)!) {
      const hero = m.pinned || m.favorite;
      const duration = Number(Math.min(MAX_PHOTO, perWeight * (hero ? 1.33 : 1)).toFixed(2));
      push({
        type: "photo",
        duration,
        mediaId: m.id,
        chapterKey: c.key,
        caption: m.caption?.trim() || null,
        portrait: (m.height ?? 0) > (m.width ?? 0),
        motion: motions[k++ % motions.length],
      });
    }
  }
  push({ type: "closing", duration: closingSeconds, lines: o.closingLines ?? CLOSING_LINES, coverMediaId: o.coverMediaId ?? null });

  const totalSeconds = Number(t.toFixed(3));
  return {
    scenes,
    totalSeconds,
    finaleStartSeconds: Math.max(0, Number((totalSeconds - song).toFixed(3))),
    photoCount: photoTotal,
    skippedUndated,
    colorGrade: o.colorGrade,
  };
}
