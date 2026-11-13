import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { requirePageOwner } from "@/server/access";
import { schema } from "@/server/db";
import { OPENMONTAGE_COMMIT, outputProfiles, pipelineCatalog, upstreamCreativeSkills, videoRecipeOptions } from "@/studio/catalog";
import { CreateProduction } from "./create";

export const dynamic = "force-dynamic";

export default async function AiStudioPage() {
  const { db, child } = await requirePageOwner();
  const projects = await db.select().from(schema.studioProjects).where(eq(schema.studioProjects.childId, child.id)).orderBy(desc(schema.studioProjects.createdAt)).limit(40);
  const pipelines = pipelineCatalog().filter((pipeline) => !pipeline.internal);
  return (
    <div className="space-y-8 py-8">
      <header>
        <p className="eyebrow text-slate">AI Studio</p>
        <h1 className="font-display mt-2 text-4xl sm:text-5xl">OpenMontage</h1>
        <p className="mt-2 max-w-2xl text-slate">
          Productions use your private library and the pinned OpenMontage checkout <span className="text-ink">{OPENMONTAGE_COMMIT.slice(0, 10)}</span>.
          Research, stock retrieval and paid generation are not run. Captions stay the words already written on each item.
        </p>
        <p className="mt-2 text-sm text-slate">{upstreamCreativeSkills().length} video-making skills from that checkout are available under Recipe.</p>
        <div className="mt-4 flex flex-wrap gap-3 text-sm">
          <Link href="/app/ai-studio/post" className="btn btn-gold">Ready to post</Link>
          <Link href="/app/ai-studio/skills" className="btn">Skills</Link>
          <Link href="/app/ai-studio/providers" className="btn">Providers</Link>
        </div>
      </header>
      <CreateProduction
        pipelines={pipelines.map((pipeline) => ({ name: pipeline.name, description: pipeline.description, sourceLed: pipeline.sourceLed }))}
        profiles={outputProfiles()}
        recipes={videoRecipeOptions()}
      />
      <section className="space-y-3">
        <h2 className="font-display text-2xl">My productions</h2>
        <p className="text-sm text-slate">Finished MP4s stay on each production. Open one to play or download.</p>
        {projects.length === 0 ? <p className="text-slate">No productions yet.</p> : null}
        <ul className="space-y-2">
          {projects.map((project) => (
            <li key={project.id}>
              <Link href={`/app/ai-studio/${project.id}`} className="card flex items-center justify-between gap-3 px-4 py-3 transition hover:border-gold">
                <span>
                  <span className="block text-ink">{project.title}</span>
                  <span className="text-sm text-slate">{project.pipeline} · {project.profile}</span>
                </span>
                <span className="text-sm text-gold-deep">{project.stage.replaceAll("_", " ").toLowerCase()}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
