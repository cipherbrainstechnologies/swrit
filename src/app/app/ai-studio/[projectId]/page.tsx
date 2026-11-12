import Link from "next/link";
import { requirePageOwner } from "@/server/access";
import { getStudioProject } from "@/server/studio";
import { ProductionEditor } from "./editor";

export const dynamic = "force-dynamic";

export default async function ProductionPage({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  const { db, child } = await requirePageOwner();
  const data = await getStudioProject(db, child.id, projectId);
  return (
    <div className="space-y-6 py-8">
      <Link href="/app/ai-studio" className="text-sm text-gold-deep hover:underline">← All productions</Link>
      <ProductionEditor
        initial={{
          id: data.project.id,
          title: data.project.title,
          prompt: data.project.prompt,
          pipeline: data.project.pipeline,
          profile: data.project.profile,
          stage: data.project.stage,
          renderRuntime: data.project.renderRuntime,
          errorMessage: data.project.errorMessage,
          proposal: data.proposal,
          assets: data.assets.map((asset) => ({
            id: asset.id,
            mediaId: asset.mediaId,
            caption: asset.caption,
            durationSeconds: asset.durationSeconds,
            omitted: asset.omitted,
            hero: asset.hero,
            position: asset.position,
          })),
          exports: data.exports.map((row) => ({
            id: row.id,
            profile: row.profile,
            status: row.status,
            width: row.width,
            height: row.height,
            durationSeconds: row.durationSeconds,
            errorMessage: row.errorMessage,
          })),
          decisions: data.decisions.map((row) => row.summary),
        }}
      />
    </div>
  );
}
