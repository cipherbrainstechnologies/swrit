import { describe, expect, it } from "vitest";
import sample from "../../src/editdna/sample-template.json";
import { edlDurationSec, parseEdl, parseStyleTemplate } from "../../src/editdna/schema";

describe("editdna schema", () => {
  it("accepts the spec sample template", () => {
    const tpl = parseStyleTemplate(sample);
    expect(tpl.template_name).toBe("fast-hookline-reel");
    expect(tpl.pacing?.beat_synced).toBe(true);
  });

  it("accepts a minimal EDL and computes duration", () => {
    const edl = parseEdl({
      name: "test",
      edl_version: 1,
      items: [
        { id: "v1", source_path: "a.mp4", timeline_start_sec: 0, duration_sec: 1.2 },
        { id: "v2", source_path: "b.mp4", timeline_start_sec: 1.2, duration_sec: 2 },
      ],
    });
    expect(edlDurationSec(edl)).toBeCloseTo(3.2, 1);
  });

  it("rejects wrong schema version", () => {
    expect(() => parseStyleTemplate({ template_name: "x", schema_version: 99 })).toThrow();
  });
});