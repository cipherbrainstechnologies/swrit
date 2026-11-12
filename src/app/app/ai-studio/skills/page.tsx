import Link from "next/link";
import { eq } from "drizzle-orm";
import { requirePageOwner } from "@/server/access";
import { schema } from "@/server/db";
import { SkillForm } from "./form";

export const dynamic = "force-dynamic";

export default async function SkillsPage() {
  const { db, child } = await requirePageOwner();
  const skills = await db.select().from(schema.studioSkills).where(eq(schema.studioSkills.childId, child.id));
  return (
    <div className="space-y-6 py-8">
      <Link href="/app/ai-studio" className="text-sm text-gold">AI Studio</Link>
      <header>
        <h1 className="font-display text-4xl">Skills</h1>
        <p className="mt-2 max-w-2xl text-slate">
          A custom recipe is the same checked JSON used by Cinema. It is stored as data. It is not run as Python, JavaScript or FFmpeg. The upstream OpenMontage skill files stay in the pinned worker checkout.
        </p>
      </header>
      <SkillForm />
      <ul className="space-y-2">
        {skills.map((skill) => (
          <li key={skill.id} className="rounded-2xl border border-white/10 px-4 py-3">
            {skill.title} · {skill.enabled ? "enabled" : "draft"}
          </li>
        ))}
      </ul>
    </div>
  );
}
