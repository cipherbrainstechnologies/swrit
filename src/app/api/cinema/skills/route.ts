import { json, requireOwner } from "@/server/access";
import { readBundledSkill, readSkillUpload } from "@/cinema/read-upload";
import { listSkills, saveSkillDraft } from "@/server/cinema";
import { HttpError } from "@/server/access";
import { route } from "@/server/http";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = route(async (req) => {
  const ctx = await requireOwner(req);
  const skills = await listSkills(ctx.db, ctx.child.id);
  return json({
    skills: skills.map((skill) => ({
      id: skill.id,
      slug: skill.slug,
      title: skill.title,
      description: skill.description,
      enabled: skill.enabled,
      activeVersionId: skill.activeVersionId,
      versions: skill.versions.map((version) => ({
        id: version.id,
        version: version.version,
        status: version.status,
        sourceName: version.sourceName,
        description: (version.manifest as { description?: string }).description ?? null,
      })),
    })),
  });
});

export const POST = route(async (req) => {
  const ctx = await requireOwner(req, { write: true });
  const form = await req.formData();
  if (form.get("bundle") === "father-and-son") {
    const skill = await readBundledSkill();
    const saved = await saveSkillDraft(ctx.db, ctx.child, skill, "father-and-son.skill.json");
    return json({ skillId: saved.skill.id, versionId: saved.version.id, status: "draft", notice: null });
  }
  const file = form.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "missing_file", "Choose a .skill.json, SKILL.md or .zip file.");
  if (file.size > 2 * 1024 * 1024) throw new HttpError(413, "too_large", "Skill files must be under 2 MB.");
  const parsed = await readSkillUpload(file.name, Buffer.from(await file.arrayBuffer()));
  if ("errors" in parsed) return json({ errors: parsed.errors }, 422);
  const saved = await saveSkillDraft(ctx.db, ctx.child, parsed.skill, file.name);
  return json({ skillId: saved.skill.id, versionId: saved.version.id, status: "draft", notice: parsed.notice });
});
