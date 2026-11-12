import { loadEnvFiles } from "./_cli";

loadEnvFiles();

async function main() {
  const { runMigrations, closeDb } = await import("../src/server/db");
  await runMigrations();
  await closeDb();
  console.log("Migrations applied.");
}

main().catch((err) => {
  console.error("Migration failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
