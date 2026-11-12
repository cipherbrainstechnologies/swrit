import { eq, sql } from "drizzle-orm";
import { schema, type DB } from "../db";

export type Job = typeof schema.jobs.$inferSelect;
export type JobType = Job["jobType"];

function rowsOf(r: unknown): Record<string, unknown>[] {
  if (Array.isArray(r)) return r as Record<string, unknown>[];
  return ((r as { rows?: Record<string, unknown>[] }).rows ?? []) as Record<string, unknown>[];
}

export async function enqueue(
  db: DB,
  jobType: JobType,
  payload: Record<string, unknown>,
  opts: { filmId?: string; idempotencyKey?: string; maxAttempts?: number } = {},
): Promise<Job> {
  if (opts.idempotencyKey) {
    const existing = await db
      .select()
      .from(schema.jobs)
      .where(eq(schema.jobs.idempotencyKey, opts.idempotencyKey))
      .limit(1);
    if (existing[0]) return existing[0];
  }
  const inserted = await db
    .insert(schema.jobs)
    .values({
      jobType,
      payload,
      filmId: opts.filmId ?? null,
      idempotencyKey: opts.idempotencyKey ?? null,
      maxAttempts: opts.maxAttempts ?? 3,
    })
    .onConflictDoNothing()
    .returning();
  if (inserted[0]) return inserted[0];
  const again = await db
    .select()
    .from(schema.jobs)
    .where(eq(schema.jobs.idempotencyKey, opts.idempotencyKey!))
    .limit(1);
  return again[0];
}

/** Claim the next runnable job with a lease. Safe across multiple workers. */
export async function claimNext(db: DB, leaseSeconds: number, types?: JobType[]): Promise<Job | null> {
  const typeFilter = types?.length
    ? sql`AND job_type IN (${sql.join(
        types.map((t) => sql`${t}`),
        sql`, `,
      )})`
    : sql``;
  const r = await db.execute(sql`
    UPDATE jobs SET
      status = 'processing',
      attempts = attempts + 1,
      locked_until = now() + make_interval(secs => ${leaseSeconds}),
      started_at = COALESCE(started_at, now()),
      error_code = NULL
    WHERE id = (
      SELECT id FROM jobs
      WHERE cancel_requested = false
        AND attempts < max_attempts
        AND (
          (status = 'queued' AND run_after <= now())
          OR (status = 'processing' AND locked_until < now())
        )
        ${typeFilter}
      ORDER BY created_at
      LIMIT 1
      FOR UPDATE SKIP LOCKED
    )
    RETURNING id`);
  const id = rowsOf(r)[0]?.id as string | undefined;
  if (!id) return null;
  const rows = await db.select().from(schema.jobs).where(eq(schema.jobs.id, id)).limit(1);
  return rows[0] ?? null;
}

export async function extendLease(db: DB, id: string, leaseSeconds: number): Promise<void> {
  await db.execute(
    sql`UPDATE jobs SET locked_until = now() + make_interval(secs => ${leaseSeconds}) WHERE id = ${id} AND status = 'processing'`,
  );
}

export async function setProgress(db: DB, id: string, progress: number): Promise<void> {
  await db
    .update(schema.jobs)
    .set({ progress: Math.max(0, Math.min(1, progress)) })
    .where(eq(schema.jobs.id, id));
}

export async function isCancelRequested(db: DB, id: string): Promise<boolean> {
  const rows = await db
    .select({ c: schema.jobs.cancelRequested })
    .from(schema.jobs)
    .where(eq(schema.jobs.id, id))
    .limit(1);
  return rows[0]?.c ?? true;
}

export async function completeJob(db: DB, id: string, outputStorageKey?: string | null): Promise<void> {
  await db
    .update(schema.jobs)
    .set({
      status: "ready",
      progress: 1,
      finishedAt: new Date(),
      lockedUntil: null,
      outputStorageKey: outputStorageKey ?? null,
      errorCode: null,
      errorMessage: null,
    })
    .where(eq(schema.jobs.id, id));
}

/** Human-readable failure. Retries with backoff until max attempts. */
export async function failJob(
  db: DB,
  job: Job,
  code: string,
  message: string,
  opts: { retryable?: boolean } = {},
): Promise<"retry" | "failed"> {
  const retry = (opts.retryable ?? true) && job.attempts < job.maxAttempts;
  await db
    .update(schema.jobs)
    .set(
      retry
        ? {
            status: "queued",
            lockedUntil: null,
            runAfter: new Date(Date.now() + 15_000 * 2 ** (job.attempts - 1)),
            errorCode: code,
            errorMessage: message.slice(0, 500),
          }
        : {
            status: "failed",
            lockedUntil: null,
            finishedAt: new Date(),
            errorCode: code,
            errorMessage: message.slice(0, 500),
          },
    )
    .where(eq(schema.jobs.id, job.id));
  return retry ? "retry" : "failed";
}

export async function cancelJob(db: DB, id: string): Promise<void> {
  await db.update(schema.jobs).set({ cancelRequested: true }).where(eq(schema.jobs.id, id));
  await db.execute(
    sql`UPDATE jobs SET status = 'cancelled', finished_at = now(), locked_until = NULL WHERE id = ${id} AND status = 'queued'`,
  );
}

/** Jobs whose lease expired after the final attempt are marked failed. */
export async function sweepExhausted(db: DB): Promise<void> {
  await db.execute(sql`
    UPDATE jobs SET status = 'failed', finished_at = now(), locked_until = NULL,
      error_code = COALESCE(error_code, 'worker_lost'),
      error_message = COALESCE(error_message, 'The worker stopped while processing this job.')
    WHERE status = 'processing' AND locked_until < now() AND attempts >= max_attempts`);
  await db.execute(sql`
    UPDATE jobs SET status = 'cancelled', finished_at = now(), locked_until = NULL
    WHERE cancel_requested = true AND status = 'processing' AND locked_until < now()`);
}
