import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { compileSkillMarkdown, validateSkill } from "@/cinema/skill";
import { buildFilmPlan, type PlanMedia } from "@/film/plan";

const skill = JSON.parse(readFileSync(path.join(process.cwd(), "cinema/skills/father-and-son.skill.json"), "utf8"));

function photos(n: number, extra: Partial<PlanMedia> = {}): PlanMedia[] {
  const start = new Date("2021-11-20T06:00:00Z").getTime();
  const end = new Date("2026-11-01T06:00:00Z").getTime();
  return Array.from({ length: n }, (_, i) => ({
    id: `m${i}`,
    kind: "image" as const,
    capturedAt: new Date(start + ((end - start) * i) / Math.max(1, n - 1)),
    dateNeedsReview: false,
    favorite: i % 11 === 0,
    caption: i % 5 === 0 ? "A real caption" : null,
    width: 4000,
    height: 3000,
    status: "ready" as const,
    ...extra,
  }));
}

describe("cinema skill schema v1", () => {
  it("accepts the bundled father-and-son skill", () => {
    const result = validateSkill(skill);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.skill.targetSeconds).toBe(300);
      expect(result.skill.captions.allowAi).toBe(false);
      expect(result.skill.audio.finale.required).toBe(true);
    }
  });

  it("rejects remote URLs, shell and unknown fields", () => {
    expect(validateSkill({ ...skill, notes: "see https://example.com" }).ok).toBe(false);
    expect(validateSkill({ ...skill, title: "run ffmpeg -i film" }).ok).toBe(false);
    expect(validateSkill({ ...skill, script: "process.exit(1)" }).ok).toBe(false);
  });

  it("compiles SKILL.md from its json block and says no model is configured", () => {
    const markdown = readFileSync(path.join(process.cwd(), "cinema/skills/SKILL.md"), "utf8");
    const compiled = compileSkillMarkdown(markdown);
    expect(compiled.skill?.id).toBe("father-and-son-five-minutes");
    expect(compiled.notice).toMatch(/No language model/);
  });

  it("plans about five minutes from real captions and flags undated pictures", () => {
    const parsed = validateSkill(skill);
    if (!parsed.ok) throw new Error("skill");
    const undated = photos(2, { id: "undated", dateNeedsReview: true, capturedAt: null, caption: "should not be invented" });
    const plan = buildFilmPlan([...photos(40), ...undated, photos(1, { id: "dup", status: "duplicate" })[0]], {
      birthDate: "2021-11-13",
      timeZone: "Asia/Kolkata",
      cutoff: new Date("2026-11-13T18:29:59Z"),
      targetSeconds: parsed.skill.targetSeconds,
      openingLines: parsed.skill.opening.lines,
      closingLines: parsed.skill.closing.lines,
      openingSeconds: parsed.skill.opening.seconds,
      closingSeconds: parsed.skill.closing.seconds,
      chapters: parsed.skill.chapters,
      excludeDuplicates: true,
      includeVideos: true,
      colorGrade: "warm-natural",
    });
    expect(plan.scenes[0]).toMatchObject({ type: "opening", lines: parsed.skill.opening.lines });
    expect(plan.totalSeconds).toBeGreaterThan(240);
    expect(plan.totalSeconds).toBeLessThan(360);
    expect(plan.skippedUndated).toBeGreaterThan(0);
    expect(plan.scenes.some((scene) => scene.type === "photo" && scene.mediaId === "dup")).toBe(false);
    const captions = plan.scenes.flatMap((scene) => (scene.type === "photo" && scene.caption ? [scene.caption] : []));
    expect(captions.every((caption) => caption === "A real caption")).toBe(true);
  });
});
