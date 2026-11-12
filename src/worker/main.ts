import { closeDb, runMigrations } from "../server/db";
import { startWorker } from "./runner";

/** Dedicated Railway worker service. No public port. */
async function main() {
  if (process.env.WORKER_RUN_MIGRATIONS === "true") await runMigrations();
  const handle = startWorker({ name: "railway-worker" });
  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(JSON.stringify({ level: "info", msg: "worker_shutdown", signal }));
    await handle.stop();
    await closeDb();
    process.exit(0);
  };
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch((err) => {
  console.error(JSON.stringify({ level: "error", msg: "worker_crashed", err: String(err) }));
  process.exit(1);
});
