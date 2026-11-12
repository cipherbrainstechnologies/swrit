import { describe, expect, it } from "vitest";
import { buildFilmPlan, CLOSING_LINES, OPENING_LINES, type PlanMedia } from "@/film/plan";
import { defaultFinaleSeconds, defaultScore, happyBirthdayBeats, synthesize, toWav } from "@/film/melody";

function photos(n: number, extra: Partial<PlanMedia> = {}): PlanMedia[] {
  const start = new Date("2021-11-20T06:00:00Z").getTime();
  const end = new Date("2026-11-01T06:00:00Z").getTime();
  return Array.from({ length: n }, (_, i) => ({
    id: `m${i}`,
    kind: "image" as const,
    capturedAt: new Date(start + ((end - start) * i) / Math.max(1, n - 1)),
    dateNeedsReview: false,
    favorite: false,
    caption: null,
    width: 4000,
    height: 3000,
    status: "ready",
    ...extra,
  }));
}

const opts = {
  birthDate: "2021-11-13",
  timeZone: "Asia/Kolkata",
  cutoff: new Date("2026-11-13T18:29:59Z"),
  targetSeconds: 180,
  songSeconds: defaultFinaleSeconds(),
};

describe("film plan", () => {
  it("opens and closes with the required banners", () => {
    const plan = buildFilmPlan(photos(30), opts);
    expect(plan.scenes[0]).toMatchObject({ type: "opening", lines: OPENING_LINES });
    expect(plan.scenes.at(-1)).toMatchObject({ type: "closing", lines: CLOSING_LINES });
    expect(CLOSING_LINES[0]).toBe("HAPPY 5TH BIRTHDAY");
    expect(CLOSING_LINES[1]).toBe("SWRITSINH CHAUHAN");
  });

  it("lands close to the 180 s target with many photos and orders chapters by age", () => {
    const plan = buildFilmPlan(photos(300), opts);
    expect(plan.totalSeconds).toBeGreaterThan(165);
    expect(plan.totalSeconds).toBeLessThan(195);
    const chapters = plan.scenes.filter((s) => s.type === "chapter").map((s) => (s.type === "chapter" ? s.chapter.key : ""));
    expect(chapters).toEqual(["beginning", "wonders", "growing", "explorer"]);
  });

  it("keeps pinned photos and leaves out omitted / undated / future ones", () => {
    const list = photos(200);
    list[17].pinned = true;
    list[18].omitted = true;
    list.push({ ...list[0], id: "undated", capturedAt: null });
    list.push({ ...list[0], id: "review", dateNeedsReview: true });
    list.push({ ...list[0], id: "after", capturedAt: new Date("2027-01-01T00:00:00Z") });
    const plan = buildFilmPlan(list, opts);
    const ids = plan.scenes.flatMap((s) => (s.type === "photo" ? [s.mediaId] : []));
    expect(ids).toContain("m17");
    expect(ids).not.toContain("m18");
    expect(ids).not.toContain("undated");
    expect(ids).not.toContain("review");
    expect(ids).not.toContain("after");
    expect(plan.skippedUndated).toBe(2);
  });

  it("only shows captions the parent wrote", () => {
    const list = photos(5);
    list[2].caption = "This was your first trip to Vietnam.";
    const plan = buildFilmPlan(list, opts);
    const caps = plan.scenes.flatMap((s) => (s.type === "photo" && s.caption ? [s.caption] : []));
    expect(caps).toEqual(["This was your first trip to Vietnam."]);
  });

  it("starts the birthday song early enough to play it fully", () => {
    const plan = buildFilmPlan(photos(100), opts);
    expect(plan.totalSeconds - plan.finaleStartSeconds).toBeCloseTo(defaultFinaleSeconds(), 1);
  });

  it("works with no photos (empty state)", () => {
    const plan = buildFilmPlan([], opts);
    expect(plan.photoCount).toBe(0);
    expect(plan.scenes.map((s) => s.type)).toEqual(["opening", "closing"]);
  });
});

describe("music", () => {
  it("uses the full traditional melody (26 beats incl. the held final note)", () => {
    expect(happyBirthdayBeats()).toBe(26);
  });
  it("synthesises a valid WAV without clipping", () => {
    const { notes } = defaultScore(40, 10);
    const pcm = synthesize(notes, 40, 8000);
    let peak = 0;
    for (const v of pcm) peak = Math.max(peak, Math.abs(v));
    expect(peak).toBeLessThanOrEqual(0.9);
    expect(peak).toBeGreaterThan(0.05);
    const wav = toWav(pcm, 8000);
    expect(Buffer.from(wav.slice(0, 4)).toString()).toBe("RIFF");
    expect(wav.length).toBe(44 + pcm.length * 2);
  });
});
