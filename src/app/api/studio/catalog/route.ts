import { json, requireOwner } from "@/server/access";
import { route } from "@/server/http";
import { declaredProviders, OPENMONTAGE_COMMIT, outputProfiles, pipelineCatalog, productionTemplates, upstreamCreativeSkills, videoRecipeOptions } from "@/studio/catalog";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = route(async (req) => {
  await requireOwner(req);
  return json({
    commit: OPENMONTAGE_COMMIT,
    repository: "https://github.com/OpenMontageInc/OpenMontage",
    license: "AGPL-3.0",
    pipelines: pipelineCatalog(),
    profiles: outputProfiles(),
    templates: productionTemplates(),
    recipes: videoRecipeOptions(),
    creativeSkills: upstreamCreativeSkills(),
    providers: declaredProviders().map((provider) => ({
      provider: provider.provider,
      capability: provider.capabilities,
      local: provider.local,
      configured: false,
    })),
    pixabay: {
      configured: Boolean(process.env.PIXABAY_API_KEY),
      suggestion: "https://pixabay.com/music/",
    },
    spendCapUsd: 0,
    externalProcessing: false,
  });
});
