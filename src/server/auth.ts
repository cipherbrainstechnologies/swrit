import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { getDb, schema, type DB } from "./db";
import { authSecret, env } from "./env";
import { audit } from "./audit";

export const SESSION_COOKIE_PREFIX = "dear-swritsinh";

function build(db: DB) {
  const e = env();
  const baseURL = e.BETTER_AUTH_URL ?? e.APP_URL;
  const production = e.NODE_ENV === "production";
  return betterAuth({
    appName: "Dear Swritsinh",
    baseURL,
    secret: authSecret(),
    trustedOrigins: [baseURL, e.APP_URL],
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: {
        user: schema.user,
        session: schema.session,
        account: schema.account,
        verification: schema.verification,
        rateLimit: schema.rateLimit,
      },
    }),
    emailAndPassword: {
      enabled: true,
      // Never allow public registration. The owner is provisioned with `pnpm owner:bootstrap`.
      disableSignUp: !e.PUBLIC_SIGNUP_ENABLED,
      minPasswordLength: 12,
      maxPasswordLength: 256,
      autoSignIn: false,
      revokeSessionsOnPasswordReset: true,
    },
    session: {
      expiresIn: 60 * 60 * 24 * 14, // 14 days
      updateAge: 60 * 60 * 24, // refresh daily
      freshAge: 60 * 15,
    },
    rateLimit: {
      enabled: true,
      storage: "database",
      window: 60,
      max: 60,
      customRules: {
        "/sign-in/email": { window: 300, max: 5 },
        "/change-password": { window: 300, max: 5 },
        "/sign-up/email": { window: 3600, max: 1 },
      },
    },
    advanced: {
      cookiePrefix: SESSION_COOKIE_PREFIX,
      useSecureCookies: production,
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: "lax",
        secure: production,
      },
      ipAddress: {
        ipAddressHeaders: e.TRUST_PROXY ? ["x-forwarded-for", "x-real-ip"] : [],
      },
    },
    databaseHooks: {
      session: {
        create: {
          after: async (s) => {
            await audit(s.userId, "auth.sign_in", "session", s.id, {
              userAgent: s.userAgent?.slice(0, 160) ?? null,
            });
          },
        },
      },
    },
  });
}

export type Auth = ReturnType<typeof build>;

const g = globalThis as unknown as { __dearSwritsinhAuth?: Promise<Auth> };

export function getAuth(): Promise<Auth> {
  g.__dearSwritsinhAuth ??= getDb().then(build);
  return g.__dearSwritsinhAuth;
}
