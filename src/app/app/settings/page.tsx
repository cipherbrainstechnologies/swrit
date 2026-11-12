import { desc, eq } from "drizzle-orm";
import { requirePageOwner } from "@/server/access";
import { schema } from "@/server/db";
import { storageDriver } from "@/server/env";
import { formatDate } from "@/lib/dates";
import { ProfileForm, SecurityPanel } from "./settings-forms";

export const dynamic = "force-dynamic";

export default async function Settings() {
  const { db, child, user } = await requirePageOwner();
  const sessions = await db
    .select({ id: schema.session.id, createdAt: schema.session.createdAt, userAgent: schema.session.userAgent, expiresAt: schema.session.expiresAt })
    .from(schema.session)
    .where(eq(schema.session.userId, user.id))
    .orderBy(desc(schema.session.createdAt))
    .limit(10);
  return (
    <div className="space-y-8 py-8">
      <header>
        <p className="eyebrow text-slate">Settings</p>
        <h1 className="font-display mt-2 text-4xl sm:text-5xl">Profile & security</h1>
      </header>
      <ProfileForm
        child={{
          fullName: child.fullName,
          preferredName: child.preferredName,
          birthDate: child.birthDate,
          birthDateConfirmed: child.birthDateConfirmed,
        }}
      />
      <SecurityPanel
        email={user.email}
        sessions={sessions.map((s) => ({
          id: s.id,
          createdAt: formatDate(s.createdAt, child.timezone, "short"),
          device: (s.userAgent ?? "Unknown device").slice(0, 80),
        }))}
      />
      <section className="card space-y-3 p-6">
        <h2 className="font-display text-2xl">Your data</h2>
        <p className="text-sm text-slate">
          Originals are stored in {storageDriver() === "r2" ? "a private Cloudflare R2 bucket" : "local development storage"}; captions, dates and
          albums are in PostgreSQL. You are never locked in.
        </p>
        <ul className="list-disc space-y-1 pl-5 text-sm text-slate">
          <li>
            <a className="underline" href="/api/export">Download the archive manifest</a> (JSON: every file, date, caption, album and SHA-256
            checksum).
          </li>
          <li>
            Full heirloom export with every original file: run <code className="rounded bg-ivory-2 px-1">pnpm export:heirloom --out ./exports</code>{" "}
            (see <code>docs/BACKUP_RESTORE.md</code>).
          </li>
          <li>Trash keeps originals; nothing is deleted permanently from the web app.</li>
        </ul>
      </section>
    </div>
  );
}
