import { storageDriver } from "../env";
import type { Storage } from "./types";

export type { Storage } from "./types";

const g = globalThis as unknown as { __dearSwritsinhStorage?: Promise<Storage> };

export function getStorage(): Promise<Storage> {
  g.__dearSwritsinhStorage ??= (async () => {
    if (storageDriver() === "r2") {
      const { createR2Storage } = await import("./r2");
      return createR2Storage();
    }
    const { createLocalStorage } = await import("./local");
    return createLocalStorage();
  })();
  return g.__dearSwritsinhStorage;
}

/** Random, non-guessable object keys. Never derived from filenames or child data. */
export function newObjectKey(prefix: "originals" | "renditions" | "imports" | "films" | "audio" | "tmp"): string {
  const id = crypto.randomUUID();
  const d = new Date();
  return `${prefix}/${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${id}`;
}
