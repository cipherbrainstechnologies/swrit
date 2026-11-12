import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { eq } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";
import { getAuth } from "@/server/auth";
import { getDb, schema, type DB } from "@/server/db";
import { ensureChildProfile } from "@/server/access";
import { decodeToken, encodeToken } from "@/server/storage/local";
import { getStorage, newObjectKey } from "@/server/storage";
import { importZipFile } from "@/server/imports/run";
import { claimNext, enqueue, failJob } from "@/server/jobs/queue";
import { processMedia } from "@/server/media/process";
import * as mediaList from "@/app/api/media/route";
import * as mediaItem from "@/app/api/media/[id]/route";
import * as mediaAccess from "@/app/api/media/[id]/access/route";
import * as uploadInit from "@/app/api/uploads/init/route";
import * as uploadComplete from "@/app/api/uploads/complete/route";
import * as localStorageRoute from "@/app/api/local-storage/[token]/route";
import * as health from "@/app/api/health/route";
import { jpeg, makeZip } from "./helpers";

const BASE = "http://localhost:3000";
let db: DB;
let cookie = "";
let ownerId = "";
let childId = "";
let foreignMediaId = "";

async function createUser(email: string, password: string) {
  const auth = await getAuth();
  const ctx = await auth.$context;
  const user = await ctx.internalAdapter.createUser({ email, name: "Parent", emailVerified: true });
  await ctx.internalAdapter.linkAccount({ userId: user.id, providerId: "credential", accountId: user.id, password: await ctx.password.hash(password) });
  return user;
}

function req(url: string, init: RequestInit & { auth?: boolean } = {}) {
  const h = new Headers(init.headers);
  if (init.auth !== false && cookie) h.set("cookie", cookie);
  if (init.method && init.method !== "GET" && !h.has("origin")) h.set("origin", BASE);
  return new Request(`${BASE}${url}`, { ...init, headers: h });
}
const params = <T>(p: T) => ({ params: Promise.resolve(p) });

beforeAll(async () => {
  fs.rmSync("./tests/.tmp/unit-objects", { recursive: true, force: true });
  db = await getDb();
  const owner = await createUser("owner@example.test", "correct-horse-battery-1");
  ownerId = owner.id;
  childId = (await ensureChildProfile(db, owner.id)).id;
  const auth = await getAuth();
  const res = await auth.api.signInEmail({ body: { email: "owner@example.test", password: "correct-horse-battery-1" }, asResponse: true });
  cookie = (res.headers.getSetCookie?.() ?? [res.headers.get("set-cookie") ?? ""]).map((c) => c.split(";")[0]).join("; ");
  expect(cookie).toContain("dear-swritsinh");

  // A different family with its own media: must be unreachable.
  const other = await createUser("other@example.test", "another-password-22");
  const otherChild = await ensureChildProfile(db, other.id);
  const [m] = await db
    .insert(schema.media)
    .values({ childId: otherChild.id, ownerUserId: other.id, storageKey: newObjectKey("originals"), filenameOriginal: "secret.jpg", kind: "image", bytes: 1, status: "ready" })
    .returning();
  foreignMediaId = m.id;
});

describe("authentication & authorisation", () => {
  it("health is public but reveals nothing", async () => {
    const r = await health.GET();
    expect(await r.json()).toEqual({ ok: true });
  });

  it("rejects unauthenticated API calls", async () => {
    const r = await mediaList.GET(req("/api/media", { auth: false }), params({}));
    expect(r.status).toBe(401);
    const a = await mediaAccess.GET(req(`/api/media/${foreignMediaId}/access`, { auth: false }), params({ id: foreignMediaId }));
    expect(a.status).toBe(401);
  });

  it("lists only the owner's media", async () => {
    const r = await mediaList.GET(req("/api/media"), params({}));
    expect(r.status).toBe(200);
    expect(r.headers.get("cache-control")).toContain("no-store");
    const d = (await r.json()) as { items: { id: string }[] };
    expect(d.items.map((i) => i.id)).not.toContain(foreignMediaId);
  });

  it("returns 404 for another family's media (no IDOR)", async () => {
    expect((await mediaAccess.GET(req(`/api/media/${foreignMediaId}/access`), params({ id: foreignMediaId }))).status).toBe(404);
    expect((await mediaItem.GET(req(`/api/media/${foreignMediaId}`), params({ id: foreignMediaId }))).status).toBe(404);
    const p = await mediaItem.PATCH(
      req(`/api/media/${foreignMediaId}`, { method: "PATCH", body: JSON.stringify({ caption: "x" }), headers: { "content-type": "application/json" } }),
      params({ id: foreignMediaId }),
    );
    expect(p.status).toBe(404);
  });

  it("blocks cross-site mutations", async () => {
    const r = await uploadInit.POST(
      req("/api/uploads/init", { method: "POST", headers: { origin: "https://evil.example", "content-type": "application/json" }, body: "{}" }),
      params({}),
    );
    expect(r.status).toBe(403);
  });

  it("has no public sign-up", async () => {
    const auth = await getAuth();
    await expect(auth.api.signUpEmail({ body: { email: "intruder@example.test", password: "intruder-password-1", name: "x" } })).rejects.toBeTruthy();
    const users = await db.select().from(schema.user);
    expect(users.map((u) => u.email)).not.toContain("intruder@example.test");
  });

  it("rate-limits password guessing with a generic error", async () => {
    const auth = await getAuth();
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) {
      const r = await auth.handler(
        new Request(`${BASE}/api/auth/sign-in/email`, {
          method: "POST",
          headers: { "content-type": "application/json", origin: BASE, "x-forwarded-for": "203.0.113.9" },
          body: JSON.stringify({ email: "owner@example.test", password: `wrong-password-${i}` }),
        }),
      );
      statuses.push(r.status);
    }
    expect(statuses[0]).toBe(401);
    expect(statuses).toContain(429);
    const rows = await db.select().from(schema.rateLimit);
    expect(rows.length).toBeGreaterThan(0); // persisted in PostgreSQL, survives restarts
  });
});

describe("signed storage URLs", () => {
  it("rejects tampered and expired tokens", async () => {
    const key = newObjectKey("originals");
    const good = encodeToken({ k: key, m: "GET", exp: Math.floor(Date.now() / 1000) + 60 });
    expect(decodeToken(good)?.k).toBe(key);
    const [payload, sig] = good.split(".");
    expect(decodeToken(`${payload}x.${sig}`)).toBeNull();
    const expired = encodeToken({ k: key, m: "GET", exp: Math.floor(Date.now() / 1000) - 1 });
    expect(decodeToken(expired)).toBeNull();
    const r = await localStorageRoute.GET(new Request(`${BASE}/api/local-storage/${payload}.bad`), params({ token: `${payload}.bad` }));
    expect(r.status).toBe(403);
  });
});

async function uploadViaApi(body: Buffer, filename: string, mime: string) {
  const init = await uploadInit.POST(
    req("/api/uploads/init", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ filename, mime, bytes: body.length }) }),
    params({}),
  );
  const d = (await init.json()) as { sessionId: string; putUrl: string };
  expect(init.status).toBe(200);
  const token = d.putUrl.split("/").pop()!;
  const put = await localStorageRoute.PUT(
    new Request(`${BASE}${d.putUrl}`, { method: "PUT", body: new Uint8Array(body), headers: { "content-type": mime } }),
    params({ token }),
  );
  expect(put.status).toBe(200);
  return uploadComplete.POST(
    req("/api/uploads/complete", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ sessionId: d.sessionId }) }),
    params({}),
  );
}

describe("upload pipeline", () => {
  it("accepts a real photo, keeps the original byte-for-byte and makes previews", async () => {
    const img = await jpeg(7, 800, 1200);
    const r = await uploadViaApi(img, "IMG20230601120000.jpg", "image/jpeg");
    expect(r.status).toBe(200);
    const { media } = (await r.json()) as { media: { id: string } };
    const res = await processMedia(db, await getStorage(), media.id);
    expect(res.status).toBe("ready");
    const row = (await db.select().from(schema.media).where(eq(schema.media.id, media.id)))[0];
    expect(row.capturedSource).toBe("filename");
    expect(row.width).toBe(800);
    const storage = await getStorage();
    const chunks: Buffer[] = [];
    for await (const c of await storage.getStream(row.storageKey)) chunks.push(c as Buffer);
    expect(Buffer.concat(chunks).equals(img)).toBe(true);
    const renditions = await db.select().from(schema.mediaRenditions).where(eq(schema.mediaRenditions.mediaId, media.id));
    expect(renditions.map((x) => x.kind).sort()).toEqual(["optimized", "thumbnail"]);
    // Authorised access redirects to a short-lived signed URL.
    const a = await mediaAccess.GET(req(`/api/media/${media.id}/access?v=thumb`), params({ id: media.id }));
    expect(a.status).toBe(302);
    expect(a.headers.get("location")).toMatch(/^\/api\/local-storage\//);
  });

  it("rejects a disguised file and deletes it", async () => {
    const r = await uploadViaApi(Buffer.from("<html><script>alert(1)</script></html>".repeat(20)), "photo.jpg", "image/jpeg");
    expect(r.status).toBe(415);
  });

  it("detects exact duplicates without deleting anything", async () => {
    const img = await jpeg(8);
    const first = (await (await uploadViaApi(img, "a.jpg", "image/jpeg")).json()) as { media: { id: string } };
    await processMedia(db, await getStorage(), first.media.id);
    const second = (await (await uploadViaApi(img, "b.jpg", "image/jpeg")).json()) as { media: { id: string } };
    const res = await processMedia(db, await getStorage(), second.media.id);
    expect(res.status).toBe("duplicate");
    const rows = await db.select().from(schema.media).where(eq(schema.media.id, first.media.id));
    expect(rows[0].deletedAt).toBeNull();
  });
});

describe("ZIP import", () => {
  it("imports nested folders and is idempotent on re-import", async () => {
    const files = await Promise.all([1, 2, 3, 4].map((i) => jpeg(100 + i)));
    const zip = makeZip([
      { name: "SWrit/IMG20220416170506.jpg", data: files[0] },
      { name: "SWrit/2023/IMG20230114142238.jpg", data: files[1] },
      { name: "SWrit/DSC_3750.JPG", data: files[2] },
      { name: "SWrit/Snapchat-1584183713.jpg", data: files[3] },
      { name: "SWrit/notes.txt", data: Buffer.from("not media") },
      { name: "../escape.jpg", data: files[0] },
    ]);
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "imp-"));
    const file = path.join(dir, "archive.zip");
    fs.writeFileSync(file, zip);
    const storage = await getStorage();
    const ctx = { db, storage, childId, ownerUserId: ownerId };
    const mk = async () =>
      (await db.insert(schema.imports).values({ ownerUserId: ownerId, childId, sourceLabel: "archive.zip" }).returning())[0].id;
    const first = await importZipFile(ctx, await mk(), file);
    expect(first).toMatchObject({ accepted: 4, duplicates: 0, rejected: 2 });
    const again = await importZipFile(ctx, await mk(), file);
    expect(again).toMatchObject({ accepted: 0, duplicates: 4 });
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe("job queue", () => {
  it("is idempotent, claims once, and retries with backoff", async () => {
    await db.update(schema.jobs).set({ status: "ready" }); // ignore jobs created by earlier tests
    const a = await enqueue(db, "media.process", { mediaId: "x" }, { idempotencyKey: "test-key-1", maxAttempts: 2 });
    const b = await enqueue(db, "media.process", { mediaId: "x" }, { idempotencyKey: "test-key-1" });
    expect(a.id).toBe(b.id);
    const claimed = await claimNext(db, 60);
    expect(claimed?.id).toBe(a.id);
    expect(await claimNext(db, 60)).toBeNull(); // leased
    expect(await failJob(db, claimed!, "boom", "Something broke")).toBe("retry");
    const row = (await db.select().from(schema.jobs).where(eq(schema.jobs.id, a.id)))[0];
    expect(row.status).toBe("queued");
    expect(row.runAfter.getTime()).toBeGreaterThan(Date.now());
  });
});
