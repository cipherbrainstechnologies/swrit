import { and, eq } from "drizzle-orm";
import { headers as nextHeaders } from "next/headers";
import { redirect } from "next/navigation";
import { getAuth } from "./auth";
import { getDb, schema, type DB } from "./db";
import { env } from "./env";

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message?: string,
  ) {
    super(message ?? code);
  }
}

export type Child = typeof schema.childProfiles.$inferSelect;
export type SessionUser = { id: string; email: string; name: string };
export type OwnerContext = { user: SessionUser; child: Child; db: DB; role: "owner" | "editor" | "viewer" };

export const NO_STORE = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
} as const;

export function json(data: unknown, init?: number | ResponseInit): Response {
  const base: ResponseInit = typeof init === "number" ? { status: init } : (init ?? {});
  const h = new Headers(base.headers);
  for (const [k, v] of Object.entries(NO_STORE)) h.set(k, v);
  h.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(data), { ...base, headers: h });
}

export function errorResponse(err: unknown): Response {
  if (err instanceof HttpError) return json({ error: err.code, message: err.message }, err.status);
  if (err && typeof err === "object" && "issues" in err) {
    return json({ error: "invalid_request", message: "The request was not valid." }, 400);
  }
  console.error(JSON.stringify({ level: "error", msg: "unhandled_api_error", err: String(err) }));
  return json({ error: "server_error", message: "Something went wrong. Please try again." }, 500);
}

export async function getSessionUser(h: Headers): Promise<SessionUser | null> {
  const auth = await getAuth();
  const s = await auth.api.getSession({ headers: h });
  if (!s?.user) return null;
  return { id: s.user.id, email: s.user.email, name: s.user.name };
}

/** The child profile this user may access, creating the default profile for the first owner. */
export async function childForUser(db: DB, userId: string): Promise<{ child: Child; role: OwnerContext["role"] } | null> {
  const owned = await db
    .select()
    .from(schema.childProfiles)
    .where(eq(schema.childProfiles.ownerUserId, userId))
    .limit(1);
  if (owned[0]) return { child: owned[0], role: "owner" };
  const shared = await db
    .select({ child: schema.childProfiles, role: schema.familyAccess.role })
    .from(schema.familyAccess)
    .innerJoin(schema.childProfiles, eq(schema.childProfiles.id, schema.familyAccess.childId))
    .where(and(eq(schema.familyAccess.userId, userId), eq(schema.familyAccess.state, "active")))
    .limit(1);
  if (shared[0]) return { child: shared[0].child, role: shared[0].role };
  return null;
}

export async function ensureChildProfile(db: DB, userId: string): Promise<Child> {
  const existing = await childForUser(db, userId);
  if (existing) return existing.child;
  const e = env();
  const [created] = await db
    .insert(schema.childProfiles)
    .values({
      ownerUserId: userId,
      fullName: e.CHILD_DEFAULT_NAME,
      preferredName: e.CHILD_DEFAULT_PREFERRED_NAME,
      birthDate: e.CHILD_DEFAULT_BIRTH_DATE,
      birthDateConfirmed: !e.CHILD_BIRTH_DATE_REQUIRES_CONFIRMATION,
      timezone: e.APP_TIMEZONE,
    })
    .returning();
  return created;
}

function sameOrigin(req: Request): boolean {
  const origin = req.headers.get("origin");
  if (!origin) {
    // Non-browser clients (no Origin) must still present a valid session cookie.
    // Browsers always send Origin on cross-site POST/PATCH/DELETE.
    return req.headers.get("sec-fetch-site") !== "cross-site";
  }
  const allowed = new Set<string>();
  const e = env();
  for (const u of [e.APP_URL, e.BETTER_AUTH_URL]) if (u) allowed.add(new URL(u).origin);
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? new URL(req.url).protocol.replace(":", "");
  if (host) allowed.add(`${proto}://${host}`);
  return allowed.has(origin);
}

/** Server-side authorization for every API route. */
export async function requireOwner(
  req: Request,
  opts: { write?: boolean } = {},
): Promise<OwnerContext> {
  const write = opts.write ?? !["GET", "HEAD"].includes(req.method);
  if (write && !sameOrigin(req)) throw new HttpError(403, "forbidden", "Cross-site request blocked.");
  const user = await getSessionUser(req.headers);
  if (!user) throw new HttpError(401, "unauthorized", "Please sign in.");
  const db = await getDb();
  const access = await childForUser(db, user.id);
  const child = access?.child ?? (await ensureChildProfile(db, user.id));
  const role = access?.role ?? "owner";
  if (write && role === "viewer") throw new HttpError(403, "forbidden", "Read-only access.");
  return { user, child, db, role };
}

/** For server components / pages: redirect to /login if not signed in. */
export async function requirePageOwner(): Promise<OwnerContext> {
  const h = await nextHeaders();
  const user = await getSessionUser(new Headers(h));
  if (!user) redirect("/login");
  const db = await getDb();
  const access = await childForUser(db, user.id);
  const child = access?.child ?? (await ensureChildProfile(db, user.id));
  return { user, child, db, role: access?.role ?? "owner" };
}

/** Persistent fixed-window limiter for privileged endpoints (shares the rate_limit table). */
export async function rateLimit(db: DB, key: string, max: number, windowSeconds: number): Promise<void> {
  const now = Date.now();
  const k = `app:${key}`;
  const rows = await db.select().from(schema.rateLimit).where(eq(schema.rateLimit.key, k)).limit(1);
  const row = rows[0];
  if (!row || now - row.lastRequest > windowSeconds * 1000) {
    if (row) {
      await db.update(schema.rateLimit).set({ count: 1, lastRequest: now }).where(eq(schema.rateLimit.id, row.id));
    } else {
      await db
        .insert(schema.rateLimit)
        .values({ id: crypto.randomUUID(), key: k, count: 1, lastRequest: now })
        .onConflictDoNothing();
    }
    return;
  }
  if (row.count >= max) throw new HttpError(429, "rate_limited", "Too many requests. Please wait a moment.");
  await db
    .update(schema.rateLimit)
    .set({ count: row.count + 1 })
    .where(eq(schema.rateLimit.id, row.id));
}
