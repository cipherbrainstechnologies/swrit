import { arg, loadEnvFiles } from "./_cli";

loadEnvFiles();

/**
 * Queue (and optionally run in-process) a birthday film render.
 *   pnpm film:render --age 5 [--resolution 1080p|2160p] [--run]
 */
async function main() {
  const age = Number(arg("age") ?? 5);
  const resolution = arg("resolution") === "2160p" ? "2160p" : "1080p";
  const { getDb, schema, closeDb } = await import("../src/server/db");
  const { ensureBirthdayFilm } = await import("../src/server/films");
  const { enqueue } = await import("../src/server/jobs/queue");
  const { eq } = await import("drizzle-orm");
  const db = await getDb();
  const child = (await db.select().from(schema.childProfiles).limit(1))[0];
  if (!child) throw new Error("No archive found. Run pnpm owner:bootstrap first.");
  const film = await ensureBirthdayFilm(db, child, age);
  const job = await enqueue(db, "film.render", { filmId: film.id, resolution }, { filmId: film.id, idempotencyKey: `film.render:${film.id}:cli:${Date.now()}`, maxAttempts: 1 });
  await db.update(schema.birthdayFilms).set({ status: "rendering" }).where(eq(schema.birthdayFilms.id, film.id));
  console.log(`Queued ${resolution} render job ${job.id} for "${film.title}".`);
  if (process.argv.includes("--run")) {
    const { startWorker } = await import("../src/worker/runner");
    const w = startWorker({ name: "cli-render", pollMs: 500 });
    for (;;) {
      const j = (await db.select().from(schema.jobs).where(eq(schema.jobs.id, job.id)).limit(1))[0];
      process.stdout.write(`\r${j.status} ${Math.round(j.progress * 100)}%   `);
      if (j.status === "ready" || j.status === "failed" || j.status === "cancelled") {
        console.log(j.status === "failed" ? `\n${j.errorMessage}` : "");
        break;
      }
      await new Promise((r) => setTimeout(r, 2000));
    }
    await w.stop();
    const f = (await db.select().from(schema.birthdayFilms).where(eq(schema.birthdayFilms.id, film.id)).limit(1))[0];
    if (f.renderedMeta) console.log(JSON.stringify(f.renderedMeta, null, 2));
  }
  await closeDb();
}

main().catch((err) => {
  console.error("Render failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
