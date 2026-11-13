import { describe, expect, it } from "vitest";
import { analyzeLibrary, buildPostPrompt, chooseEngine, planShotTiming } from "../../src/studio/post-cut";

const photo = { mediaId: "00000000-0000-4000-8000-000000000001", kind: "image" as const, durationMs: null, caption: null };
const video = { mediaId: "00000000-0000-4000-8000-000000000002", kind: "video" as const, durationMs: 40_000, caption: "Already written" };

describe("post cut", () => {
  it("keeps the owner's pictures and does not invent a caption", () => {
    const plan = planShotTiming({
      shots: [photo, video],
      patternIds: ["quick-proof", "highlight-window", "local-picture"],
      captions: [{ mediaId: photo.mediaId, text: "My line" }],
    });
    expect(plan[0].caption).toBe("My line");
    expect(plan[0].durationSeconds).toBe(2);
    expect(plan[1].caption).toBe("Already written");
    expect(plan[1].durationSeconds).toBe(4);
    const prompt = buildPostPrompt({
      theme: "A day outside",
      platform: "instagram_reels",
      patternIds: ["local-picture"],
      analysis: analyzeLibrary([photo, video]),
    });
    expect(prompt).toMatch(/not downloaded/);
    expect(prompt).not.toMatch(/birthday party|first steps|grandma/i);
  });

  it("uses a short window when every source is a long video", () => {
    const choice = chooseEngine([video, { ...video, mediaId: "00000000-0000-4000-8000-000000000003" }]);
    expect(choice.reason).toMatch(/highlight/);
    expect(choice.id).toBe("openmontage-remotion");
  });
});
