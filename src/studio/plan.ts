import { findProfile } from "./catalog";

const SHOT_SIZES = ["wide", "medium", "close_up", "medium_wide", "establishing", "medium_close"] as const;
const MOVEMENTS = ["zoom_in", "pan_left", "zoom_out", "pan_right"] as const;
const ROLES = ["establish_context", "evidence", "emotional_beat", "resolution"] as const;

export type PlannedAsset = {
  id: string;
  mediaId: string;
  kind: "image" | "video" | "audio";
  caption: string | null;
  durationSeconds: number;
  hero: boolean;
  dateNeedsReview: boolean;
  position: number;
};

export type Scene = {
  id: string;
  mediaId?: string;
  type: "broll" | "text_card";
  description: string;
  start_seconds: number;
  end_seconds: number;
  narrative_role: (typeof ROLES)[number];
  information_role: string;
  shot_intent: string;
  hero_moment: boolean;
  shot_language: {
    shot_size: (typeof SHOT_SIZES)[number];
    camera_movement: (typeof MOVEMENTS)[number] | "static";
    lighting_key: "natural";
  };
};

export function buildScenes(assets: PlannedAsset[], title: string): Scene[] {
  const visual = assets.filter((asset) => asset.kind !== "audio").slice().sort((a, b) => a.position - b.position);
  const hero = visual.find((asset) => asset.hero);
  const ordered = hero ? [hero, ...visual.filter((asset) => asset !== hero)] : visual;
  let cursor = 0;
  const opening: Scene = {
    id: "title-open",
    type: "text_card",
    description: title,
    start_seconds: 0,
    end_seconds: 3,
    narrative_role: "establish_context",
    information_role: "Shows the title the owner wrote.",
    shot_intent: "Open on the title the owner wrote.",
    hero_moment: false,
    shot_language: { shot_size: "wide", camera_movement: "static", lighting_key: "natural" },
  };
  cursor = 3;
  const scenes: Scene[] = [opening];
  ordered.forEach((asset, index) => {
    const duration = asset.hero ? Math.max(asset.durationSeconds, 6) : asset.durationSeconds;
    const caption = asset.caption?.trim();
    scenes.push({
      id: `scene-${asset.mediaId}`,
      mediaId: asset.mediaId,
      type: "broll",
      description: caption || `Selected library item ${asset.mediaId}`,
      start_seconds: cursor,
      end_seconds: cursor + duration,
      narrative_role: index === ordered.length - 1 ? "resolution" : asset.hero ? "emotional_beat" : "evidence",
      information_role: caption ? "Shows the caption the owner already wrote." : "Shows the selected library item. No caption was written.",
      shot_intent: caption
        ? "Hold this selected item long enough to read the owner's caption."
        : "Hold this selected item. Do not invent a caption.",
      hero_moment: asset.hero,
      shot_language: {
        shot_size: SHOT_SIZES[index % SHOT_SIZES.length],
        camera_movement: asset.kind === "video" ? "static" : MOVEMENTS[index % MOVEMENTS.length],
        lighting_key: "natural",
      },
    });
    cursor += duration;
  });
  scenes.push({
    id: "title-close",
    type: "text_card",
    description: title,
    start_seconds: cursor,
    end_seconds: cursor + 3,
    narrative_role: "resolution",
    information_role: "Closes on the same title.",
    shot_intent: "End on the title the owner wrote.",
    hero_moment: false,
    shot_language: { shot_size: "wide", camera_movement: "static", lighting_key: "natural" },
  });
  return scenes;
}

export function runtimeFor(assets: PlannedAsset[]): { renderRuntime: "remotion" | "ffmpeg"; rendererFamily: string } {
  const visual = assets.filter((asset) => asset.kind !== "audio");
  const hasImage = visual.some((asset) => asset.kind === "image");
  if (hasImage || visual.length === 0) return { renderRuntime: "remotion", rendererFamily: "explainer-data" };
  return { renderRuntime: "ffmpeg", rendererFamily: "explainer-data" };
}

export function buildEditDecisions(input: {
  scenes: Scene[];
  assets: PlannedAsset[];
  paths: Map<string, string>;
  renderRuntime: "remotion" | "ffmpeg";
  rendererFamily: string;
  profile: string;
  musicId?: string | null;
}) {
  const profile = findProfile(input.profile);
  const visual = input.assets.filter((asset) => asset.kind !== "audio");
  const byMedia = new Map(visual.map((asset) => [asset.mediaId, asset]));
  const byRow = new Map(visual.map((asset) => [asset.id, asset]));
  let cursor = 0;
  const cuts: Record<string, unknown>[] = [];
  const captions: { word: string; startMs: number; endMs: number }[] = [];
  const missing: string[] = [];
  for (const scene of input.scenes) {
    const duration = scene.end_seconds - scene.start_seconds;
    if (scene.type === "text_card") {
      if (input.renderRuntime !== "ffmpeg") {
        cuts.push({
          id: scene.id,
          source: "",
          type: "text_card",
          text: scene.description,
          in_seconds: cursor,
          out_seconds: cursor + duration,
          reason: scene.shot_intent,
        });
      }
      cursor += duration;
      continue;
    }
    const key = scene.id.replace(/^scene-/, "");
    const asset = (scene.mediaId && byMedia.get(scene.mediaId)) || byMedia.get(key) || byRow.get(key);
    const source = asset ? input.paths.get(asset.mediaId) : undefined;
    if (!asset || !source) {
      missing.push(scene.id);
      continue;
    }
    cuts.push({
      id: scene.id,
      source,
      in_seconds: input.renderRuntime === "ffmpeg" ? 0 : cursor,
      out_seconds: input.renderRuntime === "ffmpeg" ? duration : cursor + duration,
      source_in_seconds: 0,
      transition_in: "fade",
      transition_out: "fade",
      transition_duration: 0.4,
      reason: scene.shot_intent,
      transform: {
        scale: 1,
        position: "center",
        animation: asset.kind === "image" ? "ken-burns-slow-zoom" : "static",
      },
    });
    const words = (asset.caption ?? "").trim().split(/\s+/).filter(Boolean).slice(0, 8);
    words.forEach((word, index) => {
      const start = cursor + (duration * index) / words.length;
      captions.push({ word, startMs: Math.round(start * 1000), endMs: Math.round((start + duration / words.length) * 1000) });
    });
    cursor += duration;
  }
  return {
    version: "1.0",
    render_runtime: input.renderRuntime,
    renderer_family: input.rendererFamily,
    metadata: {
      proposal_render_runtime: input.renderRuntime,
      compose_target: profile
        ? { width: profile.width, height: profile.height, fit: "pad" }
        : { width: 1920, height: 1080, fit: "pad" },
    },
    cuts,
    captions,
    captionStyle: { fontSize: 52, bottomOffset: 240, wordsPerPage: 4 },
    tailPaddingSeconds: 0.4,
    themeConfig: {
      backgroundColor: "#1A120C",
      textColor: "#F6E7D4",
      accentColor: "#C4A574",
      captionHighlightColor: "#F2D7A2",
      captionBackgroundColor: "#1A120CCC",
    },
    audio: input.musicId ? { music: { asset_id: `music-${input.musicId}`, volume: 0.35, fade_in_seconds: 1, fade_out_seconds: 2 } } : undefined,
    subtitles: { enabled: captions.length > 0 },
    missing,
  };
}

export function deliveryCheck(input: {
  expectedSeconds: number;
  actualSeconds: number;
  width: number;
  height: number;
  profileWidth: number;
  profileHeight: number;
  mediaCuts: number;
  expectedShots: number;
  musicRequired: boolean;
  meanVolumeDb: number | null;
}): string | null {
  if (input.mediaCuts !== input.expectedShots) {
    return `The timeline has ${input.mediaCuts} shots and ${input.expectedShots} were selected. No shot was dropped.`;
  }
  if (input.actualSeconds < input.expectedSeconds - 1.5) {
    return `The file is ${input.actualSeconds.toFixed(1)}s. The approved timeline is ${input.expectedSeconds.toFixed(1)}s. This is not the finished film.`;
  }
  if (input.width !== input.profileWidth || input.height !== input.profileHeight) {
    return `The file is ${input.width}×${input.height}. The selected profile is ${input.profileWidth}×${input.profileHeight}.`;
  }
  if (input.musicRequired && (input.meanVolumeDb === null || input.meanVolumeDb < -45)) {
    return "A soundtrack was selected, but the file is silent.";
  }
  return null;
}

export function buildProposal(input: {
  title: string;
  prompt: string;
  pipeline: string;
  profile: string;
  renderRuntime: string;
  rendererFamily: string;
  assetCount: number;
  undated: number;
  durationSeconds: number;
  referenceUrl: string | null;
}) {
  const profile = findProfile(input.profile);
  return {
    version: "1.0",
    selected_concept: "source-led",
    production_plan: {
      render_runtime: input.renderRuntime,
      renderer_family: input.rendererFamily,
      pipeline: input.pipeline,
      profile: input.profile,
      width: profile?.width ?? null,
      height: profile?.height ?? null,
    },
    cost_estimate: {
      amount_usd: 0,
      note: "Local render only. No paid provider is called.",
    },
    limits: [
      "Captions are the words already stored on each item.",
      "Undated items stay in the cut and are flagged. Their dates are not guessed.",
      "A reference URL is stored and not downloaded.",
      input.referenceUrl ? "A reference URL was noted." : "No reference URL.",
      "OpenMontage research, stock retrieval and paid generation stages are not run.",
    ],
    estimate: {
      assets: input.assetCount,
      undated: input.undated,
      duration_seconds: input.durationSeconds,
      title: input.title,
      prompt_present: input.prompt.length > 0,
    },
  };
}
