import { z } from "zod";

/**
 * Cinema Skill schema v1.
 * A skill is declarative data. It is never executed: no scripts, shell, FFmpeg
 * fragments, remote URLs or storage paths chosen by the upload.
 */

export const SKILL_SCHEMA_VERSION = 1 as const;

const line = z.string().min(1).max(120);
const slug = z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(80);

const chapter = z
  .object({
    key: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(40),
    title: z.string().min(1).max(80),
    subtitle: z.string().min(1).max(120),
    fromMonths: z.number().int().min(0).max(240),
    toMonths: z.number().int().min(0).max(240),
  })
  .strict();

export const cinemaSkillSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: slug,
    title: z.string().min(1).max(120),
    description: z.string().min(1).max(600),
    targetSeconds: z.number().int().min(45).max(600),
    preferredResolution: z.enum(["1080p", "2160p"]).default("2160p"),
    previewResolution: z.enum(["1080p", "2160p"]).default("1080p"),
    fps: z.literal(24),
    aspect: z.literal("16:9"),
    color: z.object({ grade: z.enum(["warm-natural", "none"]) }).strict(),
    opening: z.object({ lines: z.array(line).min(1).max(5), seconds: z.number().min(4).max(20) }).strict(),
    closing: z.object({ lines: z.array(line).min(1).max(5), seconds: z.number().min(6).max(40) }).strict(),
    chapters: z.array(chapter).min(1).max(8),
    shots: z
      .object({
        minSeconds: z.number().min(2).max(8),
        baseSeconds: z.number().min(2).max(10),
        heroSeconds: z.number().min(3).max(12),
        transition: z.enum(["crossfade"]),
        motion: z.array(z.enum(["in", "out", "left", "right"])).min(1).max(4),
      })
      .strict(),
    audio: z
      .object({
        instrumental: z.object({ required: z.literal(false) }).strict(),
        finale: z
          .object({
            role: z.literal("happy_birthday_vocal_standard"),
            required: z.boolean(),
            align: z.literal("end"),
          })
          .strict(),
      })
      .strict(),
    selection: z
      .object({
        includeUndated: z.literal(false),
        flagUndatedForReview: z.literal(true),
        preferFavorites: z.literal(true),
        deduplicate: z.literal(true),
        curated: z.boolean(),
        includeVideoStills: z.boolean(),
      })
      .strict(),
    captions: z
      .object({
        source: z.literal("owner-written-only"),
        allowAi: z.literal(false),
      })
      .strict(),
  })
  .strict();

export type CinemaSkill = z.infer<typeof cinemaSkillSchema>;

const FORBIDDEN_KEY = /^(script|scripts|command|commands|shell|ffmpeg|ffprobe|exec|eval|url|href|sql|code)$/i;
const FORBIDDEN_VALUE = /\b(ffmpeg|ffprobe|bash|powershell|python|node|eval|exec|sh)\b|https?:\/\/|\$\(|`|;/i;

export type SkillIssue = { path: string; message: string };

function walk(value: unknown, path: string, issues: SkillIssue[]) {
  if (Array.isArray(value)) {
    value.forEach((item, i) => walk(item, `${path}[${i}]`, issues));
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (FORBIDDEN_KEY.test(key)) issues.push({ path: `${path}.${key}`, message: `Field “${key}” is not allowed in a cinema skill.` });
      walk(child, path ? `${path}.${key}` : key, issues);
    }
    return;
  }
  if (typeof value === "string" && FORBIDDEN_VALUE.test(value)) {
    issues.push({ path: path || "(root)", message: "Skills cannot contain remote URLs, shell syntax or program names." });
  }
}

/** Validate an untrusted JSON value. Returns a skill or actionable errors. Never throws on bad input. */
export function validateSkill(input: unknown): { ok: true; skill: CinemaSkill } | { ok: false; errors: SkillIssue[] } {
  const issues: SkillIssue[] = [];
  walk(input, "", issues);
  const parsed = cinemaSkillSchema.safeParse(input);
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      issues.push({ path: issue.path.join(".") || "(root)", message: issue.message });
    }
  } else {
    for (const chapter of parsed.data.chapters) {
      if (chapter.key !== "family" && chapter.toMonths <= chapter.fromMonths) {
        issues.push({ path: `chapters.${chapter.key}`, message: "toMonths must be greater than fromMonths." });
      }
    }
  }
  if (issues.length) return { ok: false, errors: issues };
  return { ok: true, skill: parsed.data! };
}

const NO_MODEL =
  "No language model is configured. Structured headings were turned into a draft manifest. Review every line, then approve the skill before it can be used. For full control, upload a .skill.json file. Nothing here is sent to an external AI provider.";

function linesAfter(markdown: string, heading: string): string[] {
  const re = new RegExp(`^${heading}\\s*$`, "im");
  const match = re.exec(markdown);
  if (!match) return [];
  const rest = markdown.slice(match.index + match[0].length).split(/\r?\n/);
  const out: string[] = [];
  for (const line of rest) {
    if (/^#{1,3} /.test(line) || /^[A-Z][A-Za-z ]+:\s*$/.test(line)) break;
    const item = line.replace(/^[-*]\s+/, "").trim();
    if (item) out.push(item);
  }
  return out;
}

/** Turn SKILL.md into a draft. A fenced json block is used when present. Headings are the fallback. */
export function compileSkillMarkdown(markdown: string): { skill: CinemaSkill | null; errors: SkillIssue[]; notice: string } {
  const fence = markdown.match(/```json\s*([\s\S]*?)```/i);
  if (fence) {
    try {
      const result = validateSkill(JSON.parse(fence[1]));
      if (result.ok) return { skill: result.skill, errors: [], notice: NO_MODEL };
      return { skill: null, errors: result.errors, notice: NO_MODEL };
    } catch {
      return { skill: null, errors: [{ path: "SKILL.md", message: "The json block is not valid JSON." }], notice: NO_MODEL };
    }
  }
  const title = (markdown.match(/^#\s+(.+)$/m)?.[1] ?? "").trim();
  const duration = Number(markdown.match(/Duration:\s*(\d+)/i)?.[1] ?? 300);
  const opening = linesAfter(markdown, "Opening");
  const closing = linesAfter(markdown, "Closing");
  const chapterLines = linesAfter(markdown, "Chapters");
  const chapters = chapterLines.map((row) => {
    const [key, chapterTitle, subtitle, range] = row.split("|").map((p) => p.trim());
    const [from, to] = (range ?? "").split("-").map((n) => Number(n));
    return { key, title: chapterTitle, subtitle, fromMonths: from, toMonths: to };
  });
  const draft = {
    schemaVersion: 1,
    id: title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80) || "untitled-skill",
    title: title || "Untitled skill",
    description: "Draft compiled from SKILL.md headings. Captions stay limited to words the owner wrote.",
    targetSeconds: duration,
    preferredResolution: "2160p",
    previewResolution: "1080p",
    fps: 24,
    aspect: "16:9",
    color: { grade: "warm-natural" },
    opening: { lines: opening.length ? opening : ["A private film"], seconds: 8 },
    closing: { lines: closing.length ? closing : ["With love"], seconds: 12 },
    chapters: chapters.length
      ? chapters
      : [{ key: "years", title: "The years we have", subtitle: "In the order they were photographed", fromMonths: 0, toMonths: 120 }],
    shots: { minSeconds: 3.2, baseSeconds: 4.2, heroSeconds: 6.5, transition: "crossfade", motion: ["in", "out", "left", "right"] },
    audio: { instrumental: { required: false }, finale: { role: "happy_birthday_vocal_standard", required: true, align: "end" } },
    selection: { includeUndated: false, flagUndatedForReview: true, preferFavorites: true, deduplicate: true, curated: true, includeVideoStills: true },
    captions: { source: "owner-written-only", allowAi: false },
  };
  const result = validateSkill(draft);
  if (!result.ok) return { skill: null, errors: result.errors, notice: NO_MODEL };
  return { skill: result.skill, errors: [], notice: NO_MODEL };
}
