import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { alias: { "@": path.resolve(__dirname, "src") } },
  test: {
    environment: "node",
    include: ["tests/unit/**/*.test.ts"],
    testTimeout: 30_000,
    hookTimeout: 60_000,
    pool: "forks",
    fileParallelism: false,
    env: {
      NODE_ENV: "test",
      DATABASE_URL: "pglite:memory",
      LOCAL_STORAGE_DIR: "./tests/.tmp/unit-objects",
      BETTER_AUTH_SECRET: "unit-test-secret-unit-test-secret-0123456789",
      APP_URL: "http://localhost:3000",
      STORAGE_DRIVER: "local",
    },
  },
});
