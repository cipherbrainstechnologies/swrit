import { describe, expect, it } from "vitest";
import { findPipeline, findProfile, pipelineCatalog, suggestPipeline } from "../../src/studio/catalog";
import { buildScenes, runtimeFor, type PlannedAsset } from "../../src/studio/plan";

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
});
