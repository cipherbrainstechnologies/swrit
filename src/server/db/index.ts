import path from "node:path";
import fs from "node:fs";
import { drizzle as drizzlePglite } from "drizzle-orm/pglite";
import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
import { migrate as migratePglite } from "drizzle-orm/pglite/migrator";
import { migrate as migratePg } from "drizzle-orm/postgres-js/migrator";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import * as schema from "./schema";
import { env } from "../env";

export type DB = PgDatabase<PgQueryResultHKT, typeof schema>;

type Holder = {
  db?: DB;
  ready?: Promise<DB>;
  close?: () => Promise<void>;
};

// One connection pool / PGlite instance per process, shared across Next.js route bundles.
const g = globalThis as unknown as { __dearSwritsinhDb?: Holder };
const holder: Holder = (g.__dearSwritsinhDb ??= {});

export function migrationsFolder(): string {
  const candidates = [
    path.join(process.cwd(), "drizzle"),
    path.join(__dirname, "../../../drizzle"),
  ];
  return candidates.find((p) => fs.existsSync(path.join(p, "meta"))) ?? candidates[0];
}

async function open(): Promise<DB> {
  const url = env().DATABASE_URL;
  if (url.startsWith("pglite:")) {
    const { PGlite } = await import("@electric-sql/pglite");
    const target = url.slice("pglite:".length);
    const dataDir = target === "memory" ? undefined : path.resolve(target);
    if (dataDir) fs.mkdirSync(dataDir, { recursive: true });
    const client = dataDir ? new PGlite(dataDir) : new PGlite();
    const db = drizzlePglite(client, { schema });
    // PGlite is a local dev/test database: keep it migrated automatically.
    await migratePglite(db, { migrationsFolder: migrationsFolder() });
    holder.close = async () => {
      await client.close();
    };
    return db as unknown as DB;
  }
  const postgres = (await import("postgres")).default;
  const client = postgres(url, { max: 10, prepare: false });
  holder.close = async () => {
    await client.end({ timeout: 5 });
  };
  return drizzlePg(client, { schema }) as unknown as DB;
}

export function getDb(): Promise<DB> {
  if (holder.db) return Promise.resolve(holder.db);
  holder.ready ??= open().then((db) => {
    holder.db = db;
    return db;
  });
  return holder.ready;
}

export async function runMigrations(): Promise<void> {
  const url = env().DATABASE_URL;
  if (url.startsWith("pglite:")) {
    await getDb();
    return;
  }
  const postgres = (await import("postgres")).default;
  const client = postgres(url, { max: 1 });
  try {
    await migratePg(drizzlePg(client), { migrationsFolder: migrationsFolder() });
  } finally {
    await client.end({ timeout: 5 });
  }
}

export async function closeDb(): Promise<void> {
  await holder.close?.();
  holder.db = undefined;
  holder.ready = undefined;
  holder.close = undefined;
}

export { schema };
