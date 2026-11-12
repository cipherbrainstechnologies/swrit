import { json, requireOwner } from "@/server/access";
import { approveSkillVersion, deleteSkill, duplicateSkill, setSkillEnabled } from "@/server/cinema";
import { assertUuid, readJson, route } from "@/server/http";
import { z } from "zod";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const body = z.object({ action: z.enum(["approve", "enable", "disable", "duplicate"]) }).strict();

export const PATCH = route<{ id: string }>(async (req, { id }) => {
  const ctx = await requireOwner(req, { write: true });
  const skillId = assertUuid(id);
  const action = body.parse(await readJson(req)).action;
  if (action === "approve") {
    const versionId = await approveSkillVersion(ctx.db, ctx.child.id, skillId);
    return json({ ok: true, versionId });
  }
  if (action === "duplicate") {
    const saved = await duplicateSkill(ctx.db, ctx.child, skillId);
    return json({ ok: true, skillId: saved.skill.id });
  }
  await setSkillEnabled(ctx.db, ctx.child.id, skillId, action === "enable");
  return json({ ok: true });
});

export const DELETE = route<{ id: string }>(async (req, { id }) => {
  const ctx = await requireOwner(req, { write: true });
  await deleteSkill(ctx.db, ctx.child.id, assertUuid(id));
  return json({ ok: true });
});
