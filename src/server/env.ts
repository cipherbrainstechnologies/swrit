import { z } from "zod";

/**
 * Server-only configuration. Never import this from a client component.
 * Values are read lazily so `next build` does not require production secrets.
 */
const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  APP_URL: z.string().url().default("http://localhost:3000"),
  BETTER_AUTH_URL: z.string().url().optional(),
  BETTER_AUTH_SECRET: z.string().min(32).optional(),
  DATABASE_URL: z.string().default("pglite:./.data/pglite"),
  STORAGE_DRIVER: z.enum(["r2", "local"]).optional(),
  LOCAL_STORAGE_DIR: z.string().default("./.data/objects"),
  R2_ACCOUNT_ID: z.string().optional(),
  R2_BUCKET: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_ENDPOINT: z.string().optional(),
  MEDIA_SIGNED_URL_TTL_SECONDS: z.coerce.number().int().min(30).max(3600).default(180),
  CHILD_DEFAULT_NAME: z.string().default("Swritsinh Chauhan"),
  CHILD_DEFAULT_PREFERRED_NAME: z.string().default("Swritsinh"),
  CHILD_DEFAULT_BIRTH_DATE: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).default("2021-11-13"),
  CHILD_BIRTH_DATE_REQUIRES_CONFIRMATION: z
    .string()
    .default("true")
    .transform((v) => v !== "false"),
  APP_TIMEZONE: z.string().default("Asia/Kolkata"),
  PUBLIC_SIGNUP_ENABLED: z
    .string()
    .default("false")
    .transform((v) => v === "true"),
  JOB_CONCURRENCY: z.coerce.number().int().min(1).max(4).default(1),
  MAX_UPLOAD_MB: z.coerce.number().int().min(1).default(2048),
  MAX_ZIP_ENTRIES: z.coerce.number().int().min(1).default(20000),
  MAX_ZIP_TOTAL_MB: z.coerce.number().int().min(1).default(20480),
  ENABLE_AI_CAPTIONS: z
    .string()
    .default("false")
    .transform((v) => v === "true"),
  ENABLE_VIDEO_RENDER: z
    .string()
    .default("true")
    .transform((v) => v !== "false"),
  OPENMONTAGE_ROOT: z.string().optional(),
  REMOTION_BROWSER_EXECUTABLE: z.string().optional(),
  STUDIO_ASSET_CAP: z.coerce.number().int().min(1).max(20000).default(5000),
  STUDIO_SPEND_CAP_USD: z.coerce.number().min(0).default(0),
  RUN_WORKER_IN_WEB: z.string().optional(),
  FFMPEG_PATH: z.string().optional(),
  FFPROBE_PATH: z.string().optional(),
  TRUST_PROXY: z
    .string()
    .default("true")
    .transform((v) => v !== "false"),
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function env(): Env {
  if (cached) return cached;
  const parsed = schema.safeParse(process.env);
  if (!parsed.success) {
    // Do not echo values: they may be secrets.
    const fields = parsed.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`Invalid server configuration in: ${fields}`);
  }
  if (
    parsed.data.NODE_ENV === "production" &&
    !process.env.DATABASE_URL &&
    process.env.NEXT_PHASE !== "phase-production-build"
  ) {
    // Never silently fall back to the embedded dev database in production.
    throw new Error("DATABASE_URL must be set in production");
  }
  cached = parsed.data;
  return cached;
}

export function isPglite(): boolean {
  return env().DATABASE_URL.startsWith("pglite:");
}

export function storageDriver(): "r2" | "local" {
  const e = env();
  if (e.STORAGE_DRIVER) return e.STORAGE_DRIVER;
  return e.R2_BUCKET && e.R2_ACCESS_KEY_ID ? "r2" : "local";
}

export function authSecret(): string {
  const e = env();
  if (e.BETTER_AUTH_SECRET) return e.BETTER_AUTH_SECRET;
  if (e.NODE_ENV === "production" && process.env.NEXT_PHASE !== "phase-production-build") {
    throw new Error("BETTER_AUTH_SECRET must be set in production");
  }
  // Development-only fallback so `pnpm dev` works out of the box. Never used in production.
  return "dev-only-insecure-secret-change-me-0123456789abcdef";
}

/** Should the background job loop run inside the web process? */
export function runWorkerInWeb(): boolean {
  const flag = env().RUN_WORKER_IN_WEB;
  if (flag) return flag === "true";
  // PGlite is single-process, so the worker must share the web process locally.
  return isPglite();
}
