import Link from "next/link";
import { requirePageOwner } from "@/server/access";
import { getEditdnaTemplate } from "@/server/editdna";
import { TemplateDetail } from "./template-detail";

export const dynamic = "force-dynamic";

export default async function EditdnaTemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { db, child } = await requirePageOwner();
  const row = await getEditdnaTemplate(db, child.id, id);

  return (
    <div className="space-y-6 py-8">
      <Link href="/app/editdna/templates" className="text-sm text-gold-deep hover:underline">
        ← Templates
      </Link>
      <header>
        <p className="eyebrow text-slate">Style template</p>
        <h1 className="font-display mt-2 text-4xl text-ink">{row.name}</h1>
        <p className="mt-1 text-sm text-slate">{row.sourceLabel ?? "imported"}</p>
      </header>
      <TemplateDetail id={row.id} name={row.name} manifest={row.manifest} />
    </div>
  );
}