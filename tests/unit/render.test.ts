import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { buildFilmPlan } from "@/film/plan";
import { renderPlanToFile } from "@/film/render";
import { ffprobe } from "@/server/media/ffmpeg";
import { jpeg } from "./helpers";

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "render-test-"));
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

describe("birthday film renderer (real FFmpeg)", () => {
  it("renders a verified 1080p H.264/AAC MP4 with titles, captions and music", async () => {
    const media = [0, 1, 2].map((i) => ({
      id: `p${i}`,
      kind: "image" as const,
      capturedAt: new Date(Date.UTC(2022 + i * 2, 0, 15)),
      dateNeedsReview: false,
      favorite: i === 1,
      caption: i === 0 ? "One little smile, a thousand beautiful memories." : null,
      width: i === 2 ? 900 : 1600,
      height: i === 2 ? 1600 : 900,
      status: "ready",
    }));
    const plan = buildFilmPlan(media, {
      birthDate: "2021-11-13",
      timeZone: "Asia/Kolkata",
      cutoff: new Date("2026-11-13T18:29:59Z"),
      targetSeconds: 60,
      songSeconds: 12,
    });
    const images = new Map<string, Buffer>();
    for (const m of media) images.set(m.id, await jpeg(Number(m.id.slice(1)) + 3, m.width, m.height));
    const out = path.join(dir, "film.mp4");
    const meta = await renderPlanToFile({
      plan,
      size: { W: 1920, H: 1080 },
      photo: async (id, dest) => {
        fs.writeFileSync(dest, images.get(id)!);
        return true;
      },
      song: null,
      outFile: out,
      workDir: dir,
    });
    expect(meta).toMatchObject({ width: 1920, height: 1080, fps: 24, videoCodec: "h264", audioCodec: "aac", audioChannels: 2, pixFmt: "yuv420p" });
    expect(Math.abs(meta.durationSeconds - plan.totalSeconds)).toBeLessThan(1);
    expect(meta.music).toMatch(/instrumental/i);
    const probe = await ffprobe(out);
    expect(probe.streams.map((s) => s.codec_type).sort()).toEqual(["audio", "video"]);
  }, 240_000);
});
