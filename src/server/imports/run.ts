import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { eq, sql } from "drizzle-orm";
import { schema, type DB } from "../db";
import { env } from "../env";
import { ingestLocalFile, type IngestContext } from "../media/ingest";
import { withTempDir } from "../media/process";
import type { Storage } from "../storage";
import { walkZip, type ZipLimits } from "./zip";

export function zipLimits(): ZipLimits {
  const e = env();
  return {
    maxEntries: e.MAX_ZIP_ENTRIES,
    maxTotalBytes: e.MAX_ZIP_TOTAL_MB * 1024 * 1024,
    maxEntryBytes: e.MAX_UPLOAD_MB * 1024 * 1024,
    maxRatio: 200,
  };
}

const MAX_ERRORS_STORED = 500;

/** Import every media entry of a local ZIP file into the archive (idempotent by SHA-256). */
export async function importZipFile(
  ctx: IngestContext,
  importId: string,
  zipPath: string,
  opts: { signal?: AbortSignal; legacyFilmFolder?: RegExp } = {},
): Promise<{ accepted: number; duplicates: number; rejected: number }> {
  const db = ctx.db;
  const counts = { accepted: 0, duplicates: 0, rejected: 0, seen: 0, total: 0 };
  const errors: { entry: string; reason: string }[] = [];
  const flush = async (final = false) => {
    await db
      .update(schema.imports)
      .set({
        accepted: counts.accepted,
        duplicates: counts.duplicates,
        rejected: counts.rejected,
        errors: errors.slice(0, MAX_ERRORS_STORED),
        progress: final ? 1 : counts.total ? Math.min(0.99, counts.seen / counts.total) : 0,
      })
      .where(eq(schema.imports.id, importId));
  };

  await withTempDir(async (dir) => {
    let n = 0;
    await walkZip(
      zipPath,
      zipLimits(),
      async (entry, extractTo) => {
        if (opts.signal?.aborted) throw new Error("cancelled");
        counts.seen++;
        const dest = path.join(dir, `entry-${n++}`);
        try {
          await extractTo(dest);
          const r = await ingestLocalFile(ctx, dest, {
            filename: entry.name.split("/").pop() ?? entry.name,
            sourcePath: entry.name,
            importId,
            isLegacyFilm: (opts.legacyFilmFolder ?? /(^|\/)legacy-films\//i).test(entry.name),
            maxBytes: zipLimits().maxEntryBytes,
          });
          if (r.outcome === "accepted") counts.accepted++;
          else if (r.outcome === "duplicate") counts.duplicates++;
          else {
            counts.rejected++;
            errors.push({ entry: entry.name, reason: r.reason });
          }
        } catch (err) {
          counts.rejected++;
          errors.push({ entry: entry.name, reason: String((err as Error).message ?? err).slice(0, 200) });
        } finally {
          await fsp.rm(dest, { force: true }).catch(() => {});
        }
        if (counts.seen % 5 === 0) await flush();
      },
      async (name, reason) => {
        counts.rejected++;
        errors.push({ entry: name, reason });
      },
      async (total) => {
        counts.total = total;
        await db.update(schema.imports).set({ entriesTotal: total }).where(eq(schema.imports.id, importId));
      },
    );
  });
  await flush(true);
  return counts;
}

/** Worker handler: download the uploaded archive from private storage, then import it. */
export async function runZipImportJob(
  db: DB,
  storage: Storage,
  importId: string,
  signal?: AbortSignal,
): Promise<void> {
  const imp = (await db.select().from(schema.imports).where(eq(schema.imports.id, importId)).limit(1))[0];
  if (!imp || !imp.sourceArchiveStorageKey) throw new Error("Import not found");
  await db.update(schema.imports).set({ status: "processing" }).where(eq(schema.imports.id, importId));
  try {
    await withTempDir(async (dir) => {
      const zipPath = path.join(dir, "archive.zip");
      await pipeline(await storage.getStream(imp.sourceArchiveStorageKey!), fs.createWriteStream(zipPath));
      await importZipFile({ db, storage, childId: imp.childId, ownerUserId: imp.ownerUserId }, importId, zipPath, { signal });
    });
    await db
      .update(schema.imports)
      .set({ status: "ready", finishedAt: new Date(), progress: 1 })
      .where(eq(schema.imports.id, importId));
  } catch (err) {
    await db
      .update(schema.imports)
      .set({
        status: "failed",
        finishedAt: new Date(),
        errors: sql`${schema.imports.errors} || ${JSON.stringify([{ entry: "(archive)", reason: String((err as Error).message ?? err).slice(0, 300) }])}::jsonb`,
      })
      .where(eq(schema.imports.id, importId));
    throw err;
  }
}
