import catalog from "./upstream-catalog.json";

export const OPENMONTAGE_COMMIT = catalog.commit;
export const OPENMONTAGE_REPOSITORY = catalog.repository;

const ARTIFACTS = new Set([
  "research_brief",
  "proposal_packet",
  "decision_log",
  "script",
  "scene_plan",
  "asset_manifest",
  "edit_decisions",
  "render_report",
  "final_review",
  "publish_log",
  "source_media_review",
]);

/** Pipelines whose compose stage can run from media the owner already has. */
const SOURCE_LED = new Set([
  "cinematic",
  "hybrid",
  "clip-factory",
  "talking-head",
  "screen-demo",
  "podcast-repurpose",
]);

export type PipelineRecord = (typeof catalog.pipelines)[number];
export type ProfileRecord = (typeof catalog.profiles)[number];

export function pipelineCatalog() {
  return catalog.pipelines.map((pipeline) => ({
    ...pipeline,
    tools: pipeline.tools.filter((tool) => !ARTIFACTS.has(tool)),
    sourceLed: SOURCE_LED.has(pipeline.name),
    internal: pipeline.name === "framework-smoke",
  }));
}

export function findPipeline(name: string) {
  return pipelineCatalog().find((pipeline) => pipeline.name === name) ?? null;
}

export function outputProfiles() {
  return catalog.profiles;
}

export function findProfile(name: string) {
  return catalog.profiles.find((profile) => profile.name === name) ?? null;
}

export function declaredProviders() {
  const byProvider = new Map<string, { provider: string; tools: string[]; capabilities: string[]; local: boolean }>();
  for (const row of catalog.providers) {
    const current = byProvider.get(row.provider) ?? {
      provider: row.provider,
      tools: [],
      capabilities: [],
      local: row.local,
    };
    current.tools.push(row.tool);
    if (!current.capabilities.includes(row.capability)) current.capabilities.push(row.capability);
    byProvider.set(row.provider, current);
  }
  return [...byProvider.values()].sort((a, b) => a.provider.localeCompare(b.provider));
}

const TEMPLATES: { id: string; title: string; pipeline: string; profile: string; prompt: string }[] = [
  { id: "cinematic-photo", title: "Cinematic Photo Film", pipeline: "cinematic", profile: "youtube_landscape", prompt: "Cut a cinematic film from the photographs I select." },
  { id: "travel", title: "Travel Documentary", pipeline: "hybrid", profile: "youtube_landscape", prompt: "Cut a travel film from the photographs and videos I select." },
  { id: "reel", title: "Instagram Reel", pipeline: "clip-factory", profile: "instagram_reels", prompt: "Cut a vertical reel from the selected videos." },
  { id: "youtube-long", title: "YouTube Long-Form Video", pipeline: "hybrid", profile: "youtube_landscape", prompt: "Assemble a landscape film from the selected library." },
  { id: "shorts", title: "YouTube Shorts", pipeline: "clip-factory", profile: "youtube_shorts", prompt: "Cut a vertical short from the selected videos." },
  { id: "birthday", title: "Birthday / Family Memory Film", pipeline: "cinematic", profile: "youtube_landscape", prompt: "Assemble a family film from the selected memories, using only the captions already written." },
  { id: "motorcycle", title: "Motorcycle / Automotive Film", pipeline: "cinematic", profile: "cinematic", prompt: "Cut a film from the riding or automotive footage I select." },
  { id: "product", title: "Product Promotional Video", pipeline: "hybrid", profile: "youtube_landscape", prompt: "Assemble a product film from the selected footage." },
  { id: "motivational", title: "Motivational Video", pipeline: "hybrid", profile: "youtube_landscape", prompt: "Assemble a short film from the selected media." },
  { id: "talking-head", title: "Talking-Head Edit", pipeline: "talking-head", profile: "youtube_landscape", prompt: "Edit the selected talking-head footage." },
  { id: "podcast", title: "Podcast Clip Factory", pipeline: "podcast-repurpose", profile: "youtube_shorts", prompt: "Cut short clips from the selected long recording." },
  { id: "explainer", title: "AI Animated Explainer", pipeline: "animated-explainer", profile: "youtube_landscape", prompt: "Make an explainer. This needs a configured generation provider." },
  { id: "documentary", title: "Documentary Montage", pipeline: "documentary-montage", profile: "youtube_landscape", prompt: "This upstream pipeline retrieves stock footage. It is not a private-memory film." },
  { id: "reference", title: "Reference-Inspired Video", pipeline: "cinematic", profile: "youtube_landscape", prompt: "Use the selected media. A reference URL is noted and is not downloaded." },
  { id: "anniversary", title: "Wedding / Anniversary Film", pipeline: "cinematic", profile: "youtube_landscape", prompt: "Assemble a film from the selected photographs and videos." },
];

export function productionTemplates() {
  const names = new Set(catalog.pipelines.map((pipeline) => pipeline.name));
  return TEMPLATES.filter((template) => names.has(template.pipeline));
}

export function suggestPipeline(prompt: string): string {
  const text = prompt.toLowerCase();
  if (/\b(podcast)\b/.test(text)) return "podcast-repurpose";
  if (/\b(talking head|interview|vlog)\b/.test(text)) return "talking-head";
  if (/\b(screen recording|screen demo|tutorial walkthrough)\b/.test(text)) return "screen-demo";
  if (/\b(reel|tiktok|short)\b/.test(text)) return "clip-factory";
  if (/\b(photo|birthday|family|travel|wedding|anniversary)\b/.test(text)) return "cinematic";
  return "hybrid";
}
