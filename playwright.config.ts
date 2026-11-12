import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);
// E2E_BASE_URL runs the suite against an already-running deployment (e.g. the Docker stack).
const EXTERNAL = process.env.E2E_BASE_URL;
const BASE = EXTERNAL ?? `http://localhost:${PORT}`;

/**
 * End-to-end tests run against the production build (`pnpm build` first) with an
 * isolated PGlite database and local object storage under tests/.tmp/e2e.
 * Locally they use the installed Edge/Chrome (PLAYWRIGHT_CHANNEL=msedge|chrome);
 * in CI run `pnpm exec playwright install chromium` and leave the channel unset.
 */
const channel = process.env.PLAYWRIGHT_CHANNEL || (process.platform === "win32" ? "msedge" : undefined);

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: BASE,
    channel,
    trace: "off",
    screenshot: "only-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "desktop",
      use: { ...devices["Desktop Chrome"], channel, storageState: "tests/.tmp/e2e/owner.json" },
      dependencies: ["setup"],
      testMatch: /.*\.spec\.ts/,
    },
  ],
  webServer: EXTERNAL
    ? undefined
    : {
        command: `node tests/e2e/start-server.mjs`,
        url: `${BASE}/api/health`,
        timeout: 180_000,
        reuseExistingServer: false,
        stdout: "ignore",
        stderr: "pipe",
        env: { E2E_PORT: String(PORT) },
      },
});
