import crypto from "node:crypto";
import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { authSecret, env } from "../env";
import type { Storage } from "./types";

/**
 * Local filesystem storage for development and automated tests ONLY.
 * Presigned URLs are HMAC-signed tokens served by /api/local-storage/[token].
 * In production the app refuses to use it (Railway disks are ephemeral).
 */

export type LocalToken = {
  k: string; // object key
  m: "GET" | "PUT";
  exp: number; // epoch seconds
  ct?: string; // content type (PUT: required match, GET: response type)
  u?: string; // multipart upload id
  p?: number; // part number
  dn?: string; // download name
};

const KEY_RE = /^[a-z]+\/(?:[0-9]{4}\/[0-9]{2}\/)?[0-9a-f-]{36}(?:\.[a-z0-9]+)?$/;

export function assertSafeKey(key: string): void {
  if (!KEY_RE.test(key)) throw new Error("Invalid object key");
}

function rootDir(): string {
  return path.resolve(env().LOCAL_STORAGE_DIR);
}

function fileFor(key: string): string {
  assertSafeKey(key);
  const p = path.join(rootDir(), ...key.split("/"));
  if (!p.startsWith(rootDir() + path.sep)) throw new Error("Invalid object key");
  return p;
}

function partDir(uploadId: string): string {
  if (!/^[0-9a-f-]{36}$/.test(uploadId)) throw new Error("Invalid upload id");
  return path.join(rootDir(), ".multipart", uploadId);
}

function sign(payload: string): string {
  return crypto.createHmac("sha256", authSecret()).update(`local-storage:${payload}`).digest("base64url");
}

export function encodeToken(t: LocalToken): string {
  const payload = Buffer.from(JSON.stringify(t)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function decodeToken(token: string, nowSeconds = Math.floor(Date.now() / 1000)): LocalToken | null {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = sign(payload);
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const t = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as LocalToken;
    if (typeof t.exp !== "number" || t.exp < nowSeconds) return null;
    assertSafeKey(t.k);
    return t;
  } catch {
    return null;
  }
}

function url(t: LocalToken): string {
  return `/api/local-storage/${encodeToken(t)}`;
}

const exp = (ttl: number) => Math.floor(Date.now() / 1000) + ttl;

export async function writePartOrObject(t: LocalToken, body: Readable): Promise<{ etag: string; bytes: number }> {
  const target = t.u ? path.join(partDir(t.u), String(t.p)) : fileFor(t.k);
  if (t.u && !fs.existsSync(partDir(t.u))) throw new Error("Unknown multipart upload");
  await fsp.mkdir(path.dirname(target), { recursive: true });
  const tmp = `${target}.${crypto.randomUUID()}.part`;
  const hash = crypto.createHash("md5");
  let bytes = 0;
  body.on("data", (c: Buffer) => {
    hash.update(c);
    bytes += c.length;
  });
  await pipeline(body, fs.createWriteStream(tmp));
  await fsp.rename(tmp, target);
  if (!t.u) await fsp.writeFile(`${target}.meta.json`, JSON.stringify({ contentType: t.ct }));
  return { etag: `"${hash.digest("hex")}"`, bytes };
}

export function createLocalStorage(): Storage {
  if (env().NODE_ENV === "production" && process.env.ALLOW_LOCAL_STORAGE_IN_PRODUCTION !== "true") {
    throw new Error("Local storage is not allowed in production. Configure Cloudflare R2.");
  }
  return {
    driver: "local",
    async presignPut(key, contentType, ttl) {
      return url({ k: key, m: "PUT", exp: exp(ttl), ct: contentType });
    },
    async presignGet(key, ttl, opts) {
      return url({ k: key, m: "GET", exp: exp(ttl), ct: opts?.contentType, dn: opts?.downloadName });
    },
    async head(key) {
      try {
        const st = await fsp.stat(fileFor(key));
        let contentType: string | undefined;
        try {
          contentType = JSON.parse(await fsp.readFile(`${fileFor(key)}.meta.json`, "utf8")).contentType;
        } catch {
          /* no metadata */
        }
        return { bytes: st.size, contentType };
      } catch {
        return null;
      }
    },
    async getStream(key, range) {
      return fs.createReadStream(fileFor(key), range ? { start: range.start, end: range.end } : undefined);
    },
    async put(key, body, contentType) {
      const stream = Buffer.isBuffer(body) ? Readable.from(body) : body;
      await writePartOrObject({ k: key, m: "PUT", exp: exp(60), ct: contentType }, stream);
    },
    async putFile(key, filePath, contentType) {
      await writePartOrObject({ k: key, m: "PUT", exp: exp(60), ct: contentType }, fs.createReadStream(filePath));
    },
    async delete(key) {
      await fsp.rm(fileFor(key), { force: true });
      await fsp.rm(`${fileFor(key)}.meta.json`, { force: true });
    },
    async createMultipart(key) {
      assertSafeKey(key);
      const id = crypto.randomUUID();
      await fsp.mkdir(partDir(id), { recursive: true });
      return id;
    },
    async presignPart(key, uploadId, partNumber, ttl) {
      return url({ k: key, m: "PUT", exp: exp(ttl), u: uploadId, p: partNumber });
    },
    async completeMultipart(key, uploadId, parts) {
      const dir = partDir(uploadId);
      const target = fileFor(key);
      await fsp.mkdir(path.dirname(target), { recursive: true });
      const out = fs.createWriteStream(target);
      for (const p of [...parts].sort((a, b) => a.partNumber - b.partNumber)) {
        await pipeline(fs.createReadStream(path.join(dir, String(p.partNumber))), out, { end: false });
      }
      await new Promise<void>((resolve, reject) => out.end((err?: Error | null) => (err ? reject(err) : resolve())));
      await fsp.writeFile(`${target}.meta.json`, JSON.stringify({}));
      await fsp.rm(dir, { recursive: true, force: true });
    },
    async abortMultipart(_key, uploadId) {
      await fsp.rm(partDir(uploadId), { recursive: true, force: true });
    },
  };
}
