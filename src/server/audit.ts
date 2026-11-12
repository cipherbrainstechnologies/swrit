import { getDb, schema } from "./db";

/**
 * Append an audit event. Metadata must never contain secrets, captions, file
 * contents or signed URLs; keep it to identifiers and short technical facts.
 */
export async function audit(
  userId: string | null,
  action: string,
  resourceType?: string | null,
  resourceId?: string | null,
  metadata?: Record<string, unknown>,
): Promise<void> {
  try {
    const db = await getDb();
    await db.insert(schema.auditEvents).values({
      userId,
      action,
      resourceType: resourceType ?? null,
      resourceId: resourceId ?? null,
      metadata: metadata ?? null,
    });
  } catch (err) {
    console.error(JSON.stringify({ level: "error", msg: "audit_failed", action, err: String(err) }));
  }
}
