import { and, eq, lt, sql } from "drizzle-orm";
import { getDb, schema, type DB } from "../server/db";
import { env } from "../server/env";
import {
  claimNext,
  completeJob,
  extendLease,
  failJob,
  isCancelRequested,
  sweepExhausted,
  type Job,
} from "../server/jobs/queue";
import { processMedia } from "../server/media/process";
import { runZipImportJob } from "../server/imports/run";
import { getStorage, type Storage } from "../server/storage";

const LEASE_SECONDS = 120;

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve();
    const t = setTimeout(done, ms);
    function done() {
      clearTimeout(t);
      signal.removeEventListener("abort", done);
      resolve();
    }
    signal.addEventListener("abort", done, { once: true });
  });
}

function log(level: "info" | "warn" | "error", msg: string, extra: Record<string, unknown> = {}) {
  // Structured, content-free logs: identifiers only, never captions, file names or URLs.
  console[level === "info" ? "log" : level](JSON.stringify({ level, msg, at: new Date().toISOString(), ...extra }));
}

class JobFailure extends Error {
  constructor(
    public code: string,
    message: string,
    public retryable = true,
  ) {
    super(message);
  }
}

async function runJob(db: DB, storage: Storage, job: Job, signal: AbortSignal): Promise<string | null> {
  switch (job.jobType) {
    case "media.process": {
      const mediaId = String(job.payload.mediaId);
      const r = await processMedia(db, storage, mediaId, { signal });
      if (r.status === "failed") throw new JobFailure("media_failed", r.error ?? "Processing failed");
      return null;
    }
    case "import.zip": {
      await runZipImportJob(db, storage, String(job.payload.importId), signal);
      return null;
    }
    case "film.render": {
      if (!env().ENABLE_VIDEO_RENDER) throw new JobFailure("render_disabled", "Video rendering is disabled on this server.", false);
      const { renderFilmJob } = await import("../film/render");
      return renderFilmJob(db, storage, job, signal);
    }
    case "studio.render": {
      if (!env().OPENMONTAGE_ROOT) throw new JobFailure("openmontage_missing", "This worker has no OpenMontage checkout.", false);
      const { renderStudioJob } = await import("../studio/run");
      try {
        return await renderStudioJob(db, storage, String(job.payload.projectId), String(job.payload.exportId), signal);
      } catch (err) {
        const coded = err as { code?: string; message?: string; retryable?: boolean };
        throw new JobFailure(coded.code || "compose_failed", coded.message || "OpenMontage render failed", coded.retryable === true);
      }
    }
    default:
      throw new JobFailure("unknown_job", `Unknown job type`, false);
  }
}

/** Abort/clean multipart uploads that were never completed. */
async function expireUploadSessions(db: DB, storage: Storage) {
  const stale = await db
    .select()
    .from(schema.uploadSessions)
    .where(and(eq(schema.uploadSessions.uploadState, "pending"), lt(schema.uploadSessions.expiresAt, new Date())))
    .limit(50);
  for (const s of stale) {
    try {
      if (s.multipartUploadId) await storage.abortMultipart(s.objectKey, s.multipartUploadId);
      else {
        // A single PUT may have landed without completion; there is no media row for it.
        await storage.delete(s.objectKey);
      }
    } catch {
      /* best effort */
    }
    await db.update(schema.uploadSessions).set({ uploadState: "expired" }).where(eq(schema.uploadSessions.id, s.id));
  }
}

export type WorkerHandle = { stop: () => Promise<void> };

export function startWorker(opts: { concurrency?: number; pollMs?: number; name?: string } = {}): WorkerHandle {
  const concurrency = opts.concurrency ?? env().JOB_CONCURRENCY;
  const pollMs = opts.pollMs ?? 1500;
  const controller = new AbortController();
  let stopping = false;
  const loops: Promise<void>[] = [];
  const active = new Map<string, AbortController>();

  const loop = async (slot: number) => {
    const db = await getDb();
    const storage = await getStorage();
    while (!stopping) {
      let job: Job | null = null;
      try {
        // Only one heavy render at a time: slot 0 handles renders.
        const configured = (process.env.WORKER_JOB_TYPES ?? "")
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean) as Job["jobType"][];
        const accepted = configured.length
          ? configured
          : (["media.process", "import.zip", "film.render"] as Job["jobType"][]);
        const types = slot === 0 ? accepted : accepted.filter((type) => type === "media.process" || type === "import.zip");
        if (!types.length) {
          await sleep(pollMs, controller.signal);
          continue;
        }
        job = await claimNext(db, LEASE_SECONDS, types);
      } catch (err) {
        log("error", "claim_failed", { err: String(err) });
      }
      if (!job) {
        await sleep(pollMs, controller.signal);
        continue;
      }
      const jobController = new AbortController();
      active.set(job.id, jobController);
      const heartbeat = setInterval(async () => {
        try {
          await extendLease(db, job!.id, LEASE_SECONDS);
          if (await isCancelRequested(db, job!.id)) jobController.abort();
        } catch {
          /* ignore */
        }
      }, 20_000);
      const started = Date.now();
      log("info", "job_started", { jobId: job.id, type: job.jobType, attempt: job.attempts });
      try {
        const output = await runJob(db, storage, job, AbortSignal.any([controller.signal, jobController.signal]));
        await completeJob(db, job.id, output);
        log("info", "job_ready", { jobId: job.id, type: job.jobType, ms: Date.now() - started });
      } catch (err) {
        if (jobController.signal.aborted && !controller.signal.aborted) {
          await db
            .update(schema.jobs)
            .set({ status: "cancelled", finishedAt: new Date(), lockedUntil: null })
            .where(eq(schema.jobs.id, job.id));
          log("warn", "job_cancelled", { jobId: job.id });
        } else if (controller.signal.aborted) {
          // Shutdown: release the lease so another worker picks it up promptly.
          await db.execute(sql`UPDATE jobs SET status = 'queued', locked_until = NULL, attempts = GREATEST(attempts - 1, 0) WHERE id = ${job.id}`);
        } else {
          const f = err instanceof JobFailure ? err : new JobFailure("job_error", String((err as Error)?.message ?? err));
          const outcome = await failJob(db, job, f.code, f.message, { retryable: f.retryable });
          log("error", "job_failed", { jobId: job.id, type: job.jobType, code: f.code, outcome });
          if (job.jobType === "film.render" && outcome === "failed" && job.filmId) {
            await db.update(schema.birthdayFilms).set({ status: "failed", cinemaPhase: "FAILED" }).where(eq(schema.birthdayFilms.id, job.filmId));
          }
        }
      } finally {
        clearInterval(heartbeat);
        active.delete(job.id);
      }
    }
  };

  const maintenance = (async () => {
    const db = await getDb();
    const storage = await getStorage();
    while (!stopping) {
      try {
        await sweepExhausted(db);
        await expireUploadSessions(db, storage);
      } catch (err) {
        log("warn", "maintenance_failed", { err: String(err) });
      }
      await sleep(60_000, controller.signal);
    }
  })();

  for (let i = 0; i < Math.max(1, concurrency) + 1; i++) loops.push(loop(i));
  log("info", "worker_started", { name: opts.name ?? "worker", concurrency });

  return {
    async stop() {
      stopping = true;
      controller.abort();
      await Promise.race([Promise.allSettled([...loops, maintenance]), sleep(10_000, new AbortController().signal)]);
    },
  };
}
