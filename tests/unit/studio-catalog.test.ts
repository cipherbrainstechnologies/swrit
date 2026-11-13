import { describe, expect, it } from "vitest";
import { findPipeline, findProfile, pipelineCatalog, suggestPipeline, upstreamCreativeSkills, videoRecipeOptions } from "../../src/studio/catalog";
import { remotionHeadlessShellPath } from "../../src/studio/run";
import { buildEditDecisions, buildScenes, deliveryCheck, runtimeFor, type PlannedAsset } from "../../src/studio/plan";

describe("openmontage catalog", () => {
  it("reads the pinned pipelines instead of a handwritten list", () => {
    const names = pipelineCatalog().map((pipeline) => pipeline.name);
    expect(names).toContain("cinematic");
    expect(names).toContain("hybrid");
    expect(names).toContain("documentary-montage");
    expect(names).toContain("animated-explainer");
    expect(findPipeline("animated-explainer")?.sourceLed).toBe(false);
    expect(findPipeline("cinematic")?.sourceLed).toBe(true);
    expect(findProfile("instagram_reels")).toMatchObject({ width: 1080, height: 1920 });
    expect(findProfile("instagram_portrait")).toBeNull();
  });

  it("resolves the Remotion headless shell path under the OpenMontage root", () => {
    const bin = remotionHeadlessShellPath("/opt/openmontage");
    expect(bin).toContain("chrome-headless-shell");
    expect(bin).toMatch(/linux64|linux-arm64/);
  });

  it("seeds OpenMontage video skills into recipe options", () => {
    expect(upstreamCreativeSkills().length).toBeGreaterThan(10);
    const recipes = videoRecipeOptions();
    expect(recipes.some((row) => row.kind === "skill" && row.title.includes("Cinematic"))).toBe(true);
    expect(recipes.some((row) => row.kind === "template")).toBe(true);
  });

  it("does not send a family prompt to the stock documentary pipeline", () => {
    expect(suggestPipeline("Turn the birthday photographs into a film")).toBe("cinematic");
    expect(suggestPipeline("Cut a vertical reel")).toBe("clip-factory");
  });

  it("builds a source-led scene plan without invented events", () => {
    const assets: PlannedAsset[] = [
      { id: "a", mediaId: "11111111-1111-1111-1111-111111111111", kind: "image", caption: "First smile", durationSeconds: 4, hero: true, dateNeedsReview: false, position: 0 },
      { id: "b", mediaId: "22222222-2222-2222-2222-222222222222", kind: "video", caption: null, durationSeconds: 5, hero: false, dateNeedsReview: true, position: 1 },
    ];
    const scenes = buildScenes(assets, "A title I wrote");
    expect(scenes[0].description).toBe("A title I wrote");
    expect(scenes[1].description).toBe("First smile");
    expect(scenes[1].information_role).toMatch(/owner already wrote/);
    expect(scenes[2].description).toContain("22222222");
    expect(scenes[2].information_role).toMatch(/No caption/);
    expect(runtimeFor(assets).renderRuntime).toBe("remotion");
    expect(runtimeFor([{ ...assets[1], kind: "video" }]).renderRuntime).toBe("ffmpeg");
  });

  it("keeps every selected shot when an older plan used scene-1 ids", () => {
    const assets: PlannedAsset[] = Array.from({ length: 8 }, (_, index) => ({
      id: String(index + 1),
      mediaId: `00000000-0000-4000-8000-00000000000${index + 1}`,
      kind: "image" as const,
      caption: null,
      durationSeconds: 4,
      hero: false,
      dateNeedsReview: false,
      position: index,
    }));
    const scenes = buildScenes(assets, "Cinematic Instagram Reel").map((scene) =>
      scene.type === "broll" ? { ...scene, id: `scene-${assets.find((asset) => asset.mediaId === scene.mediaId)?.id}`, mediaId: undefined } : scene,
    );
    const paths = new Map(assets.map((asset) => [asset.mediaId, `/tmp/${asset.mediaId}.jpg`]));
    const decisions = buildEditDecisions({
      scenes,
      assets,
      paths,
      renderRuntime: "remotion",
      rendererFamily: "explainer-data",
      profile: "instagram_reels",
    });
    expect(decisions.missing).toEqual([]);
    expect(decisions.cuts.filter((cut) => cut.source).length).toBe(8);
    expect(scenes.at(-1)?.end_seconds).toBe(38);
  });

  it("records a missing file instead of rendering the title cards alone", () => {
    const asset: PlannedAsset = {
      id: "row",
      mediaId: "00000000-0000-4000-8000-000000000001",
      kind: "image",
      caption: null,
      durationSeconds: 4,
      hero: false,
      dateNeedsReview: false,
      position: 0,
    };
    const decisions = buildEditDecisions({
      scenes: buildScenes([asset], "Title"),
      assets: [asset],
      paths: new Map(),
      renderRuntime: "remotion",
      rendererFamily: "explainer-data",
      profile: "instagram_reels",
    });
    expect(decisions.missing).toHaveLength(1);
    expect(decisions.cuts.filter((cut) => cut.source)).toHaveLength(0);
  });

  it("rejects a seven-second title card against a 38-second plan", () => {
    expect(deliveryCheck({
      expectedSeconds: 38,
      actualSeconds: 7.062,
      width: 1080,
      height: 1920,
      profileWidth: 1080,
      profileHeight: 1920,
      mediaCuts: 0,
      expectedShots: 8,
      musicRequired: false,
      meanVolumeDb: -91,
    })).toMatch(/were selected/);
    expect(deliveryCheck({
      expectedSeconds: 38,
      actualSeconds: 38.4,
      width: 1080,
      height: 1920,
      profileWidth: 1080,
      profileHeight: 1920,
      mediaCuts: 8,
      expectedShots: 8,
      musicRequired: true,
      meanVolumeDb: -91,
    })).toMatch(/silent/);
    expect(deliveryCheck({
      expectedSeconds: 38,
      actualSeconds: 38.4,
      width: 1080,
      height: 1920,
      profileWidth: 1080,
      profileHeight: 1920,
      mediaCuts: 8,
      expectedShots: 8,
      musicRequired: false,
      meanVolumeDb: -91,
    })).toBeNull();
  });
});
