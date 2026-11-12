import Link from "next/link";
import { eq } from "drizzle-orm";
import { requirePageOwner } from "@/server/access";
import { schema } from "@/server/db";
import { upstreamCreativeSkills } from "@/studio/catalog";
import { SkillForm } from "./form";

export const dynamic = "force-dynamic";

export default async function SkillsPage() {
  const { db, child } = await requirePageOwner();
  const skills = await db.select().from(schema.studioSkills).where(eq(schema.studioSkills.childId, child.id));
  const upstream = upstreamCreativeSkills();
  return (
    <div className="space-y-6 py-8">
      <Link href="/app/ai-studio" className="text-sm text-gold-deep hover:underline">← AI Studio</Link>
      <header>
        <h1 className="font-display text-4xl text-ink">Skills</h1>
        <p className="mt-2 max-w-2xl text-slate">
          A custom recipe is the same checked JSON used by Cinema. It is stored as data. It is not run as Python, JavaScript or FFmpeg. Choose an OpenMontage skill on the create page under Recipe.
        </p>
      </header>
      <section className="card space-y-2 p-4 sm:p-6">
        <h2 className="font-display text-xl text-ink">Pinned OpenMontage skills</h2>
        <p className="text-sm text-slate">{upstream.length} director skills from the pinned checkout (exported into the catalog).</p>
        <ul className="max-h-64 overflow-y-auto text-sm text-ink">
          {upstream.map((skill) => (
            <li key={skill.slug} className="border-b border-ivory-2 py-1.5 last:border-0">
              {skill.title}
              <span className="text-slate"> · {skill.group}</span>
            </li>
          ))}
        </ul>
      </section>
      <SkillForm />
      <ul className="space-y-2">
        {skills.map((skill) => (
          <li key={skill.id} className="card px-4 py-3 text-ink">
            {skill.title} · {skill.enabled ? "enabled" : "draft"}
          </li>
        ))}
      </ul>
    </div>
  );
}
