import { and, desc, eq, sql } from "drizzle-orm";
import { validateSkill, type CinemaSkill } from "../cinema/skill";
import { HttpError, type Child } from "./access";
import { schema, type DB } from "./db";

export async function listSkills(db: DB, childId: string) {
  const skills = await db.select().from(schema.cinemaSkills).where(eq(schema.cinemaSkills.childId, childId)).orderBy(desc(schema.cinemaSkills.createdAt));
  const versions = skills.length
    ? await db
        .select()
        .from(schema.cinemaSkillVersions)
        .where(sql`${schema.cinemaSkillVersions.skillId} in (${sql.join(skills.map((s) => sql`${s.id}`), sql`, `)})`)
    : [];
  return skills.map((skill) => ({
    ...skill,
    versions: versions.filter((v) => v.skillId === skill.id).sort((a, b) => b.version - a.version),
  }));
}

async function nextVersion(db: DB, skillId: string) {
  const rows = await db
    .select({ version: schema.cinemaSkillVersions.version })
    .from(schema.cinemaSkillVersions)
    .where(eq(schema.cinemaSkillVersions.skillId, skillId));
  return rows.reduce((max, row) => Math.max(max, row.version), 0) + 1;
}

export async function saveSkillDraft(db: DB, child: Child, skill: CinemaSkill, sourceName: string) {
  const existing = (
    await db
      .select()
      .from(schema.cinemaSkills)
      .where(and(eq(schema.cinemaSkills.childId, child.id), eq(schema.cinemaSkills.slug, skill.id)))
      .limit(1)
  )[0];
  const row =
    existing ??
    (
      await db
        .insert(schema.cinemaSkills)
        .values({ childId: child.id, slug: skill.id, title: skill.title, description: skill.description, enabled: false })
        .returning()
    )[0];
  const [version] = await db
    .insert(schema.cinemaSkillVersions)
    .values({
      skillId: row.id,
      version: await nextVersion(db, row.id),
      status: "draft",
      manifest: skill,
      sourceName,
    })
    .returning();
  await db
    .update(schema.cinemaSkills)
    .set({ title: skill.title, description: skill.description, updatedAt: new Date() })
    .where(eq(schema.cinemaSkills.id, row.id));
  return { skill: row, version };
}

export async function approveSkillVersion(db: DB, childId: string, skillId: string) {
  const skill = await ownedSkill(db, childId, skillId);
  const latest = await latestVersion(db, skill.id);
  if (!latest) throw new HttpError(404, "not_found", "This skill has no version to approve.");
  await db.update(schema.cinemaSkillVersions).set({ status: "approved" }).where(eq(schema.cinemaSkillVersions.id, latest.id));
  await db
    .update(schema.cinemaSkills)
    .set({ activeVersionId: latest.id, updatedAt: new Date() })
    .where(eq(schema.cinemaSkills.id, skill.id));
  return latest.id;
}

export async function setSkillEnabled(db: DB, childId: string, skillId: string, enabled: boolean) {
  const skill = await ownedSkill(db, childId, skillId);
  if (enabled) {
    if (!skill.activeVersionId) throw new HttpError(400, "not_approved", "Approve the skill before turning it on.");
    const version = (await db.select().from(schema.cinemaSkillVersions).where(eq(schema.cinemaSkillVersions.id, skill.activeVersionId)).limit(1))[0];
    if (version?.status !== "approved") throw new HttpError(400, "not_approved", "Approve the skill before turning it on.");
  }
  await db.update(schema.cinemaSkills).set({ enabled, updatedAt: new Date() }).where(eq(schema.cinemaSkills.id, skill.id));
}

export async function duplicateSkill(db: DB, child: Child, skillId: string) {
  const skill = await ownedSkill(db, child.id, skillId);
  const latest = await latestVersion(db, skill.id);
  if (!latest) throw new HttpError(404, "not_found", "Nothing to duplicate.");
  const base = latest.manifest as CinemaSkill;
  const copy = {
    ...base,
    id: `${base.id}-copy-${Date.now().toString(36)}`.slice(0, 80).replace(/-$/, ""),
    title: `${base.title} copy`,
  };
  const checked = validateSkill(copy);
  if (!checked.ok) throw new HttpError(400, "invalid_skill", checked.errors[0]?.message ?? "Could not duplicate that skill.");
  return saveSkillDraft(db, child, checked.skill, "duplicate");
}

export async function deleteSkill(db: DB, childId: string, skillId: string) {
  const skill = await ownedSkill(db, childId, skillId);
  await db.delete(schema.cinemaSkills).where(eq(schema.cinemaSkills.id, skill.id));
}

async function ownedSkill(db: DB, childId: string, skillId: string) {
  const skill = (await db.select().from(schema.cinemaSkills).where(and(eq(schema.cinemaSkills.id, skillId), eq(schema.cinemaSkills.childId, childId))).limit(1))[0];
  if (!skill) throw new HttpError(404, "not_found", "Skill not found.");
  return skill;
}

async function latestVersion(db: DB, skillId: string) {
  const rows = await db.select().from(schema.cinemaSkillVersions).where(eq(schema.cinemaSkillVersions.skillId, skillId));
  return rows.sort((a, b) => b.version - a.version)[0];
}

export async function assignAudioRole(db: DB, childId: string, mediaId: string, role: "happy_birthday_vocal_standard" | "instrumental") {
  const media = (await db.select().from(schema.media).where(and(eq(schema.media.id, mediaId), eq(schema.media.childId, childId))).limit(1))[0];
  if (!media || media.deletedAt || media.kind !== "audio") throw new HttpError(400, "not_audio", "Choose an audio file from your library.");
  await db.delete(schema.cinemaAudioAssets).where(and(eq(schema.cinemaAudioAssets.childId, childId), eq(schema.cinemaAudioAssets.role, role)));
  const [row] = await db.insert(schema.cinemaAudioAssets).values({ childId, mediaId, role }).returning();
  return row;
}

export async function createCinemaProject(
  db: DB,
  child: Child,
  input: { skillId: string; targetSeconds: number },
) {
  const skill = await ownedSkill(db, child.id, input.skillId);
  if (!skill.enabled || !skill.activeVersionId) throw new HttpError(400, "skill_disabled", "Turn on an approved skill first.");
  const version = (await db.select().from(schema.cinemaSkillVersions).where(eq(schema.cinemaSkillVersions.id, skill.activeVersionId)).limit(1))[0];
  if (!version || version.status !== "approved") throw new HttpError(400, "not_approved", "The active skill version is not approved.");
  const manifest = version.manifest as CinemaSkill;
  const birthYear = Number(child.birthDate.slice(0, 4));
  const [film] = await db
    .insert(schema.birthdayFilms)
    .values({
      childId: child.id,
      birthdayAge: 5,
      birthdayYear: birthYear + 5,
      title: manifest.title,
      source: "slideshow",
      status: "draft",
      durationTargetSeconds: input.targetSeconds,
      openingTitle: manifest.opening.lines,
      closingTitle: manifest.closing.lines,
      skillVersionId: version.id,
      cinemaPhase: "PLANNING",
      coverMediaId: child.coverMediaId,
    })
    .returning();
  return { film, manifest };
}
