import { desc, eq } from "drizzle-orm";
import { requirePageOwner } from "@/server/access";
import { listSkills } from "@/server/cinema";
import { schema } from "@/server/db";
import { CinemaStudio } from "./studio";

export const dynamic = "force-dynamic";

export default async function CinemaPage() {
  const { db, child } = await requirePageOwner();
  const skills = await listSkills(db, child.id);
  const films = await db.select().from(schema.birthdayFilms).where(eq(schema.birthdayFilms.childId, child.id)).orderBy(desc(schema.birthdayFilms.createdAt));
  return (
    <div className="space-y-6 py-8">
      <header>
        <p className="text-sm uppercase tracking-[0.2em] text-gold">Cinema Studio</p>
        <h1 className="font-display mt-2 text-4xl sm:text-5xl">Skills</h1>
        <p className="mt-2 max-w-2xl text-slate">
          Install a film style, choose the years you want, and render a private MP4. New styles are uploaded here. They do not need a new deploy.
        </p>
      </header>
      <CinemaStudio
        skills={skills.map((skill) => ({
          id: skill.id,
          title: skill.title,
          description: skill.description,
          enabled: skill.enabled,
          versions: skill.versions.map((version) => ({
            id: version.id,
            version: version.version,
            status: version.status,
            sourceName: version.sourceName,
            description: (version.manifest as { description?: string }).description ?? null,
          })),
        }))}
        projects={films.filter((film) => film.skillVersionId).map((film) => ({
          id: film.id,
          title: film.title,
          status: film.status,
          phase: film.cinemaPhase,
          durationTargetSeconds: film.durationTargetSeconds,
          hasRender: !!film.renderedStorageKey,
        }))}
      />
    </div>
  );
}
