import { and, desc, eq } from "drizzle-orm";
import { HttpError } from "./access";
import { audit } from "./audit";
import type { DB } from "./db";
import { schema } from "./db";
import { edlDurationSec, parseEdl, parseStyleTemplate, type EdlDoc, type StyleTemplateDoc } from "@/editdna/schema";
import sampleTemplate from "@/editdna/sample-template.json";

export async function listEditdnaTemplates(db: DB, childId: string, limit = 80) {
  return db
    .select()
    .from(schema.editdnaTemplates)
    .where(eq(schema.editdnaTemplates.childId, childId))
    .orderBy(desc(schema.editdnaTemplates.createdAt))
    .limit(Math.min(limit, 200));
}

export async function listEditdnaPlans(db: DB, childId: string, limit = 80) {
  return db
    .select()
    .from(schema.editdnaPlans)
    .where(eq(schema.editdnaPlans.childId, childId))
    .orderBy(desc(schema.editdnaPlans.createdAt))
    .limit(Math.min(limit, 200));
}

export async function getEditdnaTemplate(db: DB, childId: string, id: string) {
  const [row] = await db
    .select()
    .from(schema.editdnaTemplates)
    .where(and(eq(schema.editdnaTemplates.id, id), eq(schema.editdnaTemplates.childId, childId)))
    .limit(1);
  if (!row) throw new HttpError(404, "not_found", "Style template not found.");
  return row;
}

export async function getEditdnaPlan(db: DB, childId: string, id: string) {
  const [row] = await db
    .select()
    .from(schema.editdnaPlans)
    .where(and(eq(schema.editdnaPlans.id, id), eq(schema.editdnaPlans.childId, childId)))
    .limit(1);
  if (!row) throw new HttpError(404, "not_found", "Edit plan not found.");
  return row;
}

export async function createEditdnaTemplate(
  db: DB,
  childId: string,
  userId: string,
  raw: unknown,
  sourceLabel?: string,
) {
  const manifest = parseStyleTemplate(raw);
  const [row] = await db
    .insert(schema.editdnaTemplates)
    .values({
      childId,
      name: manifest.template_name,
      sourceLabel: sourceLabel?.slice(0, 500) ?? manifest.source?.slice(0, 500) ?? null,
      manifest,
    })
    .returning();
  await audit(userId, "editdna.template.create", "editdna_template", row.id, { name: row.name });
  return row;
}

export async function createEditdnaPlan(
  db: DB,
  childId: string,
  userId: string,
  raw: unknown,
  templateId?: string | null,
  notes?: string,
) {
  const edl = parseEdl(raw);
  if (templateId) await getEditdnaTemplate(db, childId, templateId);
  const [row] = await db
    .insert(schema.editdnaPlans)
    .values({
      childId,
      templateId: templateId ?? null,
      title: edl.name,
      edl,
      notes: notes?.slice(0, 2000) ?? null,
    })
    .returning();
  await audit(userId, "editdna.plan.create", "editdna_plan", row.id, {
    title: row.title,
    durationSec: edlDurationSec(edl),
  });
  return row;
}

export async function seedSampleTemplate(db: DB, childId: string, userId: string) {
  const existing = await listEditdnaTemplates(db, childId, 5);
  if (existing.some((t) => t.name === sampleTemplate.template_name)) {
    throw new HttpError(409, "exists", "The sample template is already in your vault.");
  }
  return createEditdnaTemplate(db, childId, userId, sampleTemplate, "EditDNA sample");
}

export async function deleteEditdnaTemplate(db: DB, childId: string, userId: string, id: string) {
  await getEditdnaTemplate(db, childId, id);
  await db.delete(schema.editdnaTemplates).where(eq(schema.editdnaTemplates.id, id));
  await audit(userId, "editdna.template.delete", "editdna_template", id);
}

export async function deleteEditdnaPlan(db: DB, childId: string, userId: string, id: string) {
  await getEditdnaPlan(db, childId, id);
  await db.delete(schema.editdnaPlans).where(eq(schema.editdnaPlans.id, id));
  await audit(userId, "editdna.plan.delete", "editdna_plan", id);
}

export function manifestAsStyle(manifest: Record<string, unknown>): StyleTemplateDoc {
  return parseStyleTemplate(manifest);
}

export function edlAsDoc(edl: Record<string, unknown>): EdlDoc {
  return parseEdl(edl);
}