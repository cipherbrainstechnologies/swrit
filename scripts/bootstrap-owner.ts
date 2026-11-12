import { loadEnvFiles, prompt, promptHidden } from "./_cli";

loadEnvFiles();

/**
 * One-time, idempotent owner provisioning. There is no public sign-up.
 *
 *   pnpm owner:bootstrap                      # asks for email + password (hidden)
 *   OWNER_EMAIL=... OWNER_PASSWORD=... pnpm owner:bootstrap   # non-interactive (CI / Railway shell)
 *
 * Refuses to run once any user exists. The password is never printed or logged.
 */
async function main() {
  const { getDb, schema, closeDb } = await import("../src/server/db");
  const { getAuth } = await import("../src/server/auth");
  const { ensureChildProfile } = await import("../src/server/access");
  const { ensureDefaultAlbums } = await import("../src/server/films");
  const { audit } = await import("../src/server/audit");
  const db = await getDb();

  const existing = await db.select({ id: schema.user.id }).from(schema.user).limit(1);
  if (existing.length) {
    console.log("An owner already exists. Nothing to do (bootstrap is disabled after the first owner).");
    await closeDb();
    return;
  }

  const email = (process.env.OWNER_EMAIL ?? (await prompt("Owner email: "))).trim().toLowerCase();
  const name = (process.env.OWNER_NAME ?? "Dad").trim();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error("That does not look like an email address.");
  let password = process.env.OWNER_PASSWORD;
  if (!password) {
    password = await promptHidden("Choose a password (12+ characters, not shown): ");
    const again = await promptHidden("Repeat the password: ");
    if (again !== password) throw new Error("Passwords did not match.");
  }
  if (password.length < 12) throw new Error("Use at least 12 characters.");
  if (/^(.)\1+$/.test(password) || /^(password|123456789012|qwertyuiop)/i.test(password)) {
    throw new Error("That password is too easy to guess.");
  }

  const auth = await getAuth();
  const ctx = await auth.$context;
  const hash = await ctx.password.hash(password);
  const user = await ctx.internalAdapter.createUser({ email, name, emailVerified: true });
  await ctx.internalAdapter.linkAccount({ userId: user.id, providerId: "credential", accountId: user.id, password: hash });
  const child = await ensureChildProfile(db, user.id);
  await ensureDefaultAlbums(db, child.id);
  await audit(user.id, "owner.bootstrapped", "user", user.id);
  console.log(`Owner account created for ${email}. Sign in at your app's /login page.`);
  await closeDb();
}

main().catch((err) => {
  console.error("Bootstrap failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
