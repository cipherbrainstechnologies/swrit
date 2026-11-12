import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import yauzl, { type Entry } from "yauzl";
import { compileSkillMarkdown, validateSkill, type CinemaSkill, type SkillIssue } from "./skill";

const ALLOWED = new Set(["skill.json", "SKILL.md", "skill.md"]);

function entryAllowed(name: string): boolean {
  const base = name.replace(/\\/g, "/").split("/").pop() ?? name;
  if (ALLOWED.has(base) || base.endsWith(".skill.json")) return true;
  return /^assets\/.+\.(png|jpe?g|webp)$/i.test(name.replace(/\\/g, "/"));
}

async function unzip(buf: Buffer): Promise<Map<string, Buffer>> {
  const dir = await mkdtemp(path.join(os.tmpdir(), "cinema-skill-"));
  const file = path.join(dir, "skill.zip");
  await writeFile(file, buf);
  try {
    const files = new Map<string, Buffer>();
    await new Promise<void>((resolve, reject) => {
      yauzl.open(file, { lazyEntries: true, autoClose: true }, (err, zip) => {
        if (err || !zip) return reject(err ?? new Error("Could not read the zip."));
        zip.readEntry();
        zip.on("entry", (entry: Entry) => {
          const name = entry.fileName.replace(/\\/g, "/");
          if (name.endsWith("/")) {
            zip.readEntry();
            return;
          }
          if (name.split("/").some((part) => part === ".." || part === "")) {
            reject(new Error(`Rejected path ${name}`));
            return;
          }
          if (!entryAllowed(name)) {
            reject(new Error(`Unsupported file in skill zip: ${name}`));
            return;
          }
          zip.openReadStream(entry, (streamErr, stream) => {
            if (streamErr || !stream) return reject(streamErr ?? new Error("Could not read a zip entry."));
            const chunks: Buffer[] = [];
            stream.on("data", (chunk: Buffer) => chunks.push(chunk));
            stream.on("end", () => {
              files.set(name, Buffer.concat(chunks));
              zip.readEntry();
            });
            stream.on("error", reject);
          });
        });
        zip.on("end", () => resolve());
        zip.on("error", reject);
      });
    });
    return files;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

export async function readSkillUpload(filename: string, bytes: Buffer): Promise<{ skill: CinemaSkill; notice: string | null } | { errors: SkillIssue[] }> {
  const lower = filename.toLowerCase();
  let jsonText: string | null = null;
  let markdown: string | null = null;
  if (lower.endsWith(".zip")) {
    const files = await unzip(bytes);
    for (const [name, body] of files) {
      const base = name.split("/").pop()?.toLowerCase() ?? "";
      if (base.endsWith(".skill.json") || base === "skill.json") jsonText = body.toString("utf8");
      if (base === "skill.md") markdown = body.toString("utf8");
    }
    if (!jsonText && !markdown) return { errors: [{ path: filename, message: "The zip needs a .skill.json or SKILL.md file." }] };
  } else if (lower.endsWith(".json")) {
    jsonText = bytes.toString("utf8");
  } else if (lower.endsWith(".md")) {
    markdown = bytes.toString("utf8");
  } else {
    return { errors: [{ path: filename, message: "Upload a .skill.json, SKILL.md or a zip of those files." }] };
  }

  if (jsonText) {
    try {
      const result = validateSkill(JSON.parse(jsonText));
      if (!result.ok) return { errors: result.errors };
      return { skill: result.skill, notice: null };
    } catch {
      return { errors: [{ path: filename, message: "That file is not valid JSON." }] };
    }
  }
  const compiled = compileSkillMarkdown(markdown ?? "");
  if (!compiled.skill) return { errors: compiled.errors.length ? compiled.errors : [{ path: filename, message: "Could not compile SKILL.md." }] };
  return { skill: compiled.skill, notice: compiled.notice };
}

export async function readBundledSkill(): Promise<CinemaSkill> {
  const file = path.join(process.cwd(), "cinema", "skills", "father-and-son.skill.json");
  const result = validateSkill(JSON.parse(await readFile(file, "utf8")));
  if (!result.ok) throw new Error(result.errors.map((e) => e.message).join(" "));
  return result.skill;
}
