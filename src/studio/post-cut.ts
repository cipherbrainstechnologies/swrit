export const POST_PLATFORMS = [
  { id: "instagram_reels", label: "Instagram Reels", width: 1080, height: 1920 },
  { id: "youtube_shorts", label: "YouTube Shorts", width: 1080, height: 1920 },
  { id: "tiktok", label: "TikTok", width: 1080, height: 1920 },
] as const;

export type PostPlatform = (typeof POST_PLATFORMS)[number]["id"];

export type EditPattern = {
  id: string;
  title: string;
  edit: string;
  source: string;
};

/** Public short-form edit structures. These are techniques, not downloaded videos. */
export const EDIT_PATTERNS: EditPattern[] = [
  { id: "cold-open", title: "Cold open", edit: "The first photograph or clip is on screen before the title finishes speaking.", source: "short-video-maker" },
  { id: "caption-bottom", title: "Bottom caption", edit: "On-screen words sit in the lower safe area, clear of the platform buttons.", source: "short-video-maker" },
  { id: "quick-proof", title: "Quick proof", edit: "Photographs hold for about two seconds so the cut keeps moving.", source: "MoneyPrinterTurbo" },
  { id: "slow-hold", title: "Slow hold", edit: "Photographs hold for about five seconds with a slow Ken Burns move.", source: "OpenMontage" },
  { id: "pattern-interrupt", title: "Pattern interrupt", edit: "Short and long holds alternate so the rhythm changes.", source: "autoclip" },
  { id: "hero-open", title: "Hero open", edit: "The first selected item opens the film and holds longer.", source: "OpenMontage" },
  { id: "motion-keep", title: "Keep the motion", edit: "A video keeps its own movement. It is not turned into a still.", source: "autoclip" },
  { id: "highlight-window", title: "Highlight window", edit: "A long video contributes a short window, not the whole recording.", source: "autoclip" },
  { id: "bookend", title: "Title bookend", edit: "The hook you write opens the film and returns at the end.", source: "short-video-maker" },
  { id: "local-picture", title: "Your pictures stay", edit: "Stock footage is not fetched. Every shot is a file you selected.", source: "MoneyPrinterTurbo local upload" },
];

export type LibraryShot = {
  mediaId: string;
  kind: "image" | "video";
  durationMs: number | null;
  caption: string | null;
};

export type EngineChoice = {
  id: "openmontage-remotion";
  reason: string;
};

export function chooseEngine(shots: LibraryShot[]): EngineChoice {
  const videos = shots.filter((shot) => shot.kind === "video");
  const long = videos.some((shot) => (shot.durationMs ?? 0) > 15_000);
  if (videos.length && shots.every((shot) => shot.kind === "video") && long) {
    return {
      id: "openmontage-remotion",
      reason: "AutoClip's highlight idea applies: long videos you uploaded are cut to a short window. The render stays on your files in Remotion.",
    };
  }
  return {
    id: "openmontage-remotion",
    reason: "Short Video Maker's caption and vertical-safe rules apply to your photographs and clips. MoneyPrinterTurbo's stock search stays off.",
  };
}

export function analyzeLibrary(shots: LibraryShot[]) {
  const images = shots.filter((shot) => shot.kind === "image").length;
  const videos = shots.filter((shot) => shot.kind === "video").length;
  const captioned = shots.filter((shot) => shot.caption?.trim()).length;
  return {
    shots: shots.length,
    images,
    videos,
    captioned,
    engine: chooseEngine(shots),
  };
}

export function isPostPlatform(value: string): value is PostPlatform {
  return POST_PLATFORMS.some((platform) => platform.id === value);
}

export function planShotTiming(input: {
  shots: LibraryShot[];
  patternIds: string[];
  captions: { mediaId: string; text: string }[];
}): { mediaId: string; caption: string | null; durationSeconds: number; hero: boolean }[] {
  const patterns = new Set(input.patternIds);
  const captionById = new Map(input.captions.map((row) => [row.mediaId, row.text.trim().slice(0, 500)]));
  const quick = patterns.has("quick-proof");
  const slow = patterns.has("slow-hold");
  const interrupt = patterns.has("pattern-interrupt");
  return input.shots.map((shot, index) => {
    const written = captionById.get(shot.mediaId);
    const caption = written === undefined ? shot.caption : written || null;
    let duration = shot.kind === "video" ? Math.min(Math.max((shot.durationMs ?? 4000) / 1000, 2), patterns.has("highlight-window") ? 4 : 6) : 4;
    if (shot.kind === "image") {
      if (interrupt) duration = index % 2 === 0 ? 2 : 5;
      else if (quick && !slow) duration = 2;
      else if (slow && !quick) duration = 5;
    }
    return {
      mediaId: shot.mediaId,
      caption,
      durationSeconds: duration,
      hero: patterns.has("hero-open") && index === 0,
    };
  });
}

export function buildPostPrompt(input: {
  theme: string;
  platform: PostPlatform;
  patternIds: string[];
  analysis: ReturnType<typeof analyzeLibrary>;
}): string {
  const names = EDIT_PATTERNS.filter((pattern) => input.patternIds.includes(pattern.id)).map((pattern) => pattern.title);
  const platform = POST_PLATFORMS.find((row) => row.id === input.platform)?.label ?? input.platform;
  return [
    `Post to ${platform}.`,
    `Theme the owner wrote: ${input.theme.trim()}.`,
    `${input.analysis.images} photographs and ${input.analysis.videos} videos from the private library.`,
    `Edit patterns: ${names.join(", ") || "title bookend"}.`,
    input.analysis.engine.reason,
    "On-screen words are only the hook and captions the owner typed. No childhood event is invented.",
    "Other people's Instagram videos are not downloaded.",
  ].join(" ");
}
