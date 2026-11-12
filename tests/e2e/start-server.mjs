// Starts an isolated production server for Playwright: fresh PGlite DB + local storage,
// one bootstrapped test owner, in-process worker. Requires `pnpm build` beforehand.
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "../..");
const tmp = path.join(root, "tests/.tmp/e2e");
fs.rmSync(tmp, { recursive: true, force: true });
fs.mkdirSync(tmp, { recursive: true });

const port = process.env.E2E_PORT ?? "3100";
const env = {
  ...process.env,
  NODE_ENV: "production",
  NEXT_TELEMETRY_DISABLED: "1",
  PORT: port,
  APP_URL: `http://localhost:${port}`,
  BETTER_AUTH_URL: `http://localhost:${port}`,
  BETTER_AUTH_SECRET: "e2e-only-secret-e2e-only-secret-0123456789",
  DATABASE_URL: `pglite:${path.join(tmp, "db")}`,
  STORAGE_DRIVER: "local",
  LOCAL_STORAGE_DIR: path.join(tmp, "objects"),
  ALLOW_LOCAL_STORAGE_IN_PRODUCTION: "true",
  TRUST_PROXY: "false",
  OWNER_EMAIL: "owner@example.test",
  OWNER_PASSWORD: "e2e-owner-password-123",
};

const tsx = path.join(root, "node_modules/.bin", process.platform === "win32" ? "tsx.cmd" : "tsx");
const boot = spawnSync(tsx, ["scripts/bootstrap-owner.ts"], { cwd: root, env, stdio: "inherit", shell: process.platform === "win32" });
if (boot.status !== 0) process.exit(boot.status ?? 1);

const next = path.join(root, "node_modules/next/dist/bin/next");
const child = spawn(process.execPath, [next, "start", "-H", "127.0.0.1", "-p", port], { cwd: root, env, stdio: "inherit" });
const stop = () => child.kill();
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
child.on("exit", (code) => process.exit(code ?? 0));
