import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { eq } from "drizzle-orm";
import sharp from "sharp";
import { schema, type DB } from "../server/db";
import { filmData } from "../server/films";
import { ffmpegPath, ffprobe, frameRate, run } from "../server/media/ffmpeg";
import { resolveVariant } from "../server/media/queries";
import { withTempDir } from "../server/media/process";
import { setProgress, type Job } from "../server/jobs/queue";
import { newObjectKey, type Storage } from "../server/storage";
import { defaultScore, instrumentalBed, synthesize, toWav } from "./melody";
import type { FilmPlan, Scene } from "./plan";

/**
 * Server-side birthday film renderer.
 * Every scene becomes a still composed with sharp (blurred fill + whole photo, TV-safe
 * captions), animated with a restrained FFmpeg zoompan, then concatenated and muxed
 * with the score. The output is verified with ffprobe and frame sampling before the
 * film is marked ready. Nothing is reported as done until the object exists in storage.
 */

export const FPS = 24;
const FADE = 0.45;
const COLORS = { midnight: "#101A2B", ivory: "#F7F4ED", gold: "#DDBB78" };

function fontDir(): string {
  const candidates = [path.join(process.cwd(), "assets/fonts"), path.join(__dirname, "../../assets/fonts")];
  return candidates.find((p) => fs.existsSync(p)) ?? candidates[0];
}
const DISPLAY_FONT = () => path.join(fontDir(), "CormorantGaramond-wght.ttf");
const SANS_FONT = () => path.join(fontDir(), "Inter-opsz-wght.ttf");

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Render a block of text to a transparent PNG buffer using a bundled font. */
async function textImage(
  text: string,
  opts: { font: "display" | "sans"; size: number; color: string; width: number; letterSpacing?: number; italic?: boolean },
): Promise<{ buf: Buffer; width: number; height: number }> {
  const family = opts.font === "display" ? "Cormorant Garamond" : "Inter";
  const spacing = opts.letterSpacing ? ` letter_spacing="${Math.round(opts.letterSpacing * 1024)}"` : "";
  const style = opts.italic ? ` style="italic"` : "";
  const img = sharp({
    text: {
      text: `<span foreground="${opts.color}"${spacing}${style}>${esc(text)}</span>`,
      font: `${family} ${opts.size}`,
      fontfile: opts.font === "display" ? DISPLAY_FONT() : SANS_FONT(),
      width: opts.width,
      align: "centre",
      rgba: true,
      dpi: 72,
      wrap: "word",
    },
  });
  const buf = await img.png().toBuffer();
  const meta = await sharp(buf).metadata();
  return { buf, width: meta.width ?? 0, height: meta.height ?? 0 };
}

type Size = { W: number; H: number };

async function stack(
  lines: { text: string; font: "display" | "sans"; size: number; color: string; spacing?: number; gap: number; italic?: boolean }[],
  size: Size,
): Promise<sharp.OverlayOptions[]> {
  const imgs = [];
  for (const l of lines) {
    imgs.push({ ...(await textImage(l.text, { font: l.font, size: l.size, color: l.color, width: Math.round(size.W * 0.8), letterSpacing: l.spacing, italic: l.italic })), gap: l.gap });
  }
  const total = imgs.reduce((h, i) => h + i.height + i.gap, 0);
  let y = Math.round((size.H - total) / 2);
  const out: sharp.OverlayOptions[] = [];
  for (const i of imgs) {
    y += i.gap;
    out.push({ input: i.buf, top: y, left: Math.round((size.W - i.width) / 2) });
    y += i.height;
  }
  return out;
}

async function bannerFrame(scene: Extract<Scene, { type: "opening" | "closing" }>, cover: string | null, size: Size, file: string) {
  const { W, H } = size;
  const u = H / 1080;
  let base = sharp({ create: { width: W, height: H, channels: 3, background: COLORS.midnight } });
  const layers: sharp.OverlayOptions[] = [];
  if (cover) {
    const bg = await sharp(cover).rotate().resize(W, H, { fit: "cover" }).blur(3).modulate({ brightness: 0.42 }).toBuffer();
    layers.push({ input: bg, top: 0, left: 0 });
    const shade = Buffer.from(
      `<svg width="${W}" height="${H}"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${COLORS.midnight}" stop-opacity="0.35"/><stop offset="1" stop-color="${COLORS.midnight}" stop-opacity="0.85"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`,
    );
    layers.push({ input: shade, top: 0, left: 0 });
  }
  const [l1 = "", l2 = "", ...rest] = scene.lines;
  const lines =
    scene.type === "opening"
      ? [
          { text: l1, font: "sans" as const, size: Math.round(30 * u), color: COLORS.gold, spacing: 10 * u, gap: 0 },
          { text: l2, font: "display" as const, size: Math.round(120 * u), color: COLORS.ivory, gap: Math.round(44 * u) },
          ...rest.map((r) => ({ text: r, font: "display" as const, size: Math.round(46 * u), color: "#E9E3D6", gap: Math.round(36 * u), italic: true })),
        ]
      : [
          { text: l1, font: "display" as const, size: Math.round(118 * u), color: COLORS.gold, gap: 0 },
          { text: l2, font: "display" as const, size: Math.round(78 * u), color: COLORS.ivory, spacing: 4 * u, gap: Math.round(30 * u) },
          ...rest.map((r, i) => ({
            text: r,
            font: "display" as const,
            size: Math.round(44 * u),
            color: i === rest.length - 1 ? COLORS.gold : "#E9E3D6",
            gap: Math.round(34 * u),
            italic: i === rest.length - 1,
          })),
        ];
  layers.push(...(await stack(lines, size)));
  base = base.composite(layers);
  await base.jpeg({ quality: 94 }).toFile(file);
}

async function chapterFrame(scene: Extract<Scene, { type: "chapter" }>, size: Size, file: string) {
  const u = size.H / 1080;
  const rule = Buffer.from(`<svg width="${Math.round(120 * u)}" height="${Math.max(2, Math.round(2 * u))}"><rect width="100%" height="100%" fill="${COLORS.gold}"/></svg>`);
  const text = await stack(
    [
      { text: scene.chapter.title, font: "display", size: Math.round(110 * u), color: COLORS.ivory, gap: Math.round(40 * u) },
      { text: scene.chapter.subtitle.toUpperCase(), font: "sans", size: Math.round(26 * u), color: COLORS.gold, spacing: 8 * u, gap: Math.round(26 * u) },
    ],
    size,
  );
  const firstTop = (text[0] as { top: number }).top;
  await sharp({ create: { width: size.W, height: size.H, channels: 3, background: COLORS.midnight } })
    .composite([{ input: rule, top: Math.max(0, firstTop - Math.round(10 * u)), left: Math.round((size.W - 120 * u) / 2) }, ...text])
    .jpeg({ quality: 94 })
    .toFile(file);
}

/** Photo plate at `scale`× output size: blurred fill + the whole photo, never stretched. */
async function photoFrame(src: string, size: Size, scale: number, file: string) {
  const W = Math.round(size.W * scale);
  const H = Math.round(size.H * scale);
  const bg = await sharp(src).rotate().resize(W, H, { fit: "cover" }).blur(Math.max(20, Math.round(30 * scale))).modulate({ brightness: 0.55 }).toBuffer();
  const fg = await sharp(src).rotate().resize(W, H, { fit: "inside", withoutEnlargement: false, kernel: "lanczos3" }).toBuffer({ resolveWithObject: true });
  await sharp(bg)
    .composite([{ input: fg.data, top: Math.round((H - fg.info.height) / 2), left: Math.round((W - fg.info.width) / 2) }])
    .jpeg({ quality: 93 })
    .toFile(file);
}

/** Caption overlay on a gradient plate inside the TV-safe area (bottom 10% margin). */
async function captionOverlay(caption: string, size: Size, file: string) {
  const u = size.H / 1080;
  const t = await textImage(caption, { font: "display", size: Math.round(58 * u), color: COLORS.ivory, width: Math.round(size.W * 0.8) });
  const plateH = Math.round(t.height + 260 * u);
  const plate = Buffer.from(
    `<svg width="${size.W}" height="${plateH}"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#000" stop-opacity="0"/><stop offset="0.55" stop-color="#000" stop-opacity="0.45"/><stop offset="1" stop-color="#000" stop-opacity="0.7"/></linearGradient></defs><rect width="100%" height="100%" fill="url(#g)"/></svg>`,
  );
  await sharp({ create: { width: size.W, height: size.H, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([
      { input: plate, top: size.H - plateH, left: 0 },
      { input: t.buf, top: Math.round(size.H - size.H * 0.1 - t.height), left: Math.round((size.W - t.width) / 2) },
    ])
    .png()
    .toFile(file);
}

function zoomExpr(motion: "in" | "out" | "left" | "right", frames: number, amount: number) {
  const p = `(on/${Math.max(1, frames - 1)})`;
  switch (motion) {
    case "in":
      return { z: `1+${amount}*${p}`, x: "iw/2-(iw/zoom/2)", y: "ih/2-(ih/zoom/2)" };
    case "out":
      return { z: `1+${amount}-${amount}*${p}`, x: "iw/2-(iw/zoom/2)", y: "ih/2-(ih/zoom/2)" };
    case "left":
      return { z: `1+${amount}`, x: `(iw-iw/zoom)*(1-${p})`, y: "ih/2-(ih/zoom/2)" };
    case "right":
      return { z: `1+${amount}`, x: `(iw-iw/zoom)*${p}`, y: "ih/2-(ih/zoom/2)" };
  }
}

async function encodeClip(
  frame: string,
  overlay: string | null,
  seconds: number,
  size: Size,
  motion: "in" | "out" | "left" | "right" | "none",
  out: string,
  signal?: AbortSignal,
  heavy = false,
) {
  const frames = Math.max(1, Math.round(seconds * FPS));
  const fadeOut = Math.max(0, frames / FPS - FADE);
  const chain: string[] = [];
  if (motion === "none") {
    chain.push(`[0:v]scale=${size.W}:${size.H},setsar=1,fps=${FPS}[base]`);
  } else {
    const e = zoomExpr(motion, frames, 0.06);
    chain.push(`[0:v]zoompan=z='${e.z}':x='${e.x}':y='${e.y}':d=${frames}:s=${size.W}x${size.H}:fps=${FPS},setsar=1[base]`);
  }
  if (overlay) chain.push(`[base][1:v]overlay=0:0:format=auto[ov]`);
  const last = overlay ? "[ov]" : "[base]";
  chain.push(`${last}fade=t=in:st=0:d=${FADE},fade=t=out:st=${fadeOut.toFixed(3)}:d=${FADE},format=yuv420p[v]`);
  const args = ["-y", "-loop", "1", "-framerate", String(FPS), "-i", frame];
  if (overlay) args.push("-loop", "1", "-framerate", String(FPS), "-i", overlay);
  args.push(
    "-filter_complex", chain.join(";"),
    "-map", "[v]",
    "-frames:v", String(frames),
    "-r", String(FPS),
    "-c:v", "libx264",
    "-preset", heavy ? "medium" : "veryfast",
    "-crf", heavy ? "18" : "19",
    "-pix_fmt", "yuv420p",
    "-profile:v", "high",
    "-video_track_timescale", String(FPS * 1000),
    out,
  );
  await run(ffmpegPath(), args, { timeoutMs: 20 * 60_000, signal });
}

async function download(storage: Storage, key: string, dest: string) {
  await pipeline(await storage.getStream(key), fs.createWriteStream(dest));
}

export type RenderMeta = {
  width: number;
  height: number;
  fps: number;
  durationSeconds: number;
  videoCodec: string;
  audioCodec: string;
  audioChannels: number;
  pixFmt: string;
  bytes: number;
  scenes: number;
  music: string;
  renderedAt: string;
};

/** ffprobe + frame sampling. Throws a human-readable error if anything is off. */
export async function verifyFilm(file: string, expect: { W: number; H: number; seconds: number }): Promise<Omit<RenderMeta, "scenes" | "music" | "renderedAt">> {
  const p = await ffprobe(file);
  const v = p.streams.find((s) => s.codec_type === "video");
  const a = p.streams.find((s) => s.codec_type === "audio");
  const problems: string[] = [];
  if (!v) problems.push("no video stream");
  if (!a) problems.push("no audio stream");
  if (v && (v.width !== expect.W || v.height !== expect.H)) problems.push(`size ${v.width}x${v.height}`);
  if (v && v.codec_name !== "h264") problems.push(`video codec ${v.codec_name}`);
  if (v && v.pix_fmt !== "yuv420p") problems.push(`pixel format ${v.pix_fmt}`);
  const fps = frameRate(v?.avg_frame_rate ?? v?.r_frame_rate);
  if (Math.abs(fps - FPS) > 0.1) problems.push(`frame rate ${fps}`);
  if (a && a.codec_name !== "aac") problems.push(`audio codec ${a.codec_name}`);
  const duration = Number(p.format.duration ?? 0);
  if (Math.abs(duration - expect.seconds) > 1.5) problems.push(`duration ${duration.toFixed(1)}s, expected ${expect.seconds.toFixed(1)}s`);
  // Sample opening, middle and closing frames: none may be a flat black screen.
  for (const at of [Math.min(4, duration / 4), duration / 2, Math.max(0, duration - 5)]) {
    const shot = `${file}.qa-${Math.round(at)}.png`;
    await run(ffmpegPath(), ["-y", "-ss", at.toFixed(2), "-i", file, "-frames:v", "1", shot], { timeoutMs: 60_000 });
    const stats = await sharp(shot).stats();
    const spread = stats.channels.slice(0, 3).reduce((s, c) => s + c.stdev, 0) / 3;
    const mean = stats.channels.slice(0, 3).reduce((s, c) => s + c.mean, 0) / 3;
    if (spread < 3 && mean < 12) problems.push(`black frame at ${at.toFixed(1)}s`);
    await fsp.rm(shot, { force: true });
  }
  if (problems.length) throw new Error(`Render failed verification: ${problems.join(", ")}`);
  return {
    width: v!.width!,
    height: v!.height!,
    fps: Math.round(fps * 100) / 100,
    durationSeconds: Math.round(duration * 100) / 100,
    videoCodec: v!.codec_name!,
    audioCodec: a!.codec_name!,
    audioChannels: a!.channels ?? 0,
    pixFmt: v!.pix_fmt!,
    bytes: (await fsp.stat(file)).size,
  };
}

/** Build the soundtrack WAV/M4A for the plan; returns the file and a human label. */
async function soundtrack(
  dir: string,
  plan: FilmPlan,
  song: string | null,
  signal?: AbortSignal,
): Promise<{ file: string; label: string }> {
  const total = plan.totalSeconds;
  const out = path.join(dir, "soundtrack.m4a");
  if (song) {
    const bed = path.join(dir, "bed.wav");
    await fsp.writeFile(bed, toWav(synthesize(instrumentalBed(plan.finaleStartSeconds), plan.finaleStartSeconds + 2)));
    const delayMs = Math.round(plan.finaleStartSeconds * 1000);
    await run(
      ffmpegPath(),
      [
        "-y", "-i", bed, "-i", song,
        "-filter_complex",
        `[0:a]afade=t=out:st=${Math.max(0, plan.finaleStartSeconds - 1.5).toFixed(2)}:d=1.5,aformat=sample_rates=48000:channel_layouts=stereo[b];` +
          `[1:a]aformat=sample_rates=48000:channel_layouts=stereo,afade=t=in:d=0.4,adelay=${delayMs}|${delayMs}[s];` +
          `[b][s]amix=inputs=2:duration=longest:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11,` +
          `atrim=0:${total.toFixed(3)},afade=t=out:st=${Math.max(0, total - 2.5).toFixed(2)}:d=2.5[a]`,
        "-map", "[a]", "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2", out,
      ],
      { timeoutMs: 10 * 60_000, signal },
    );
    return { file: out, label: "Original instrumental + parent-uploaded finale song" };
  }
  const wav = path.join(dir, "score.wav");
  await fsp.writeFile(wav, toWav(synthesize(defaultScore(total, plan.finaleStartSeconds).notes, total + 1)));
  await run(
    ffmpegPath(),
    [
      "-y", "-i", wav,
      "-af", `aformat=sample_rates=48000:channel_layouts=stereo,loudnorm=I=-16:TP=-1.5:LRA=11,atrim=0:${total.toFixed(3)},afade=t=out:st=${Math.max(0, total - 2.5).toFixed(2)}:d=2.5`,
      "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2", out,
    ],
    { timeoutMs: 10 * 60_000, signal },
  );
  return { file: out, label: "Original instrumental + traditional Happy Birthday melody (instrumental, no vocals)" };
}

export async function renderPlanToFile(opts: {
  plan: FilmPlan;
  size: Size;
  photo: (mediaId: string, dest: string) => Promise<boolean>;
  song: string | null;
  outFile: string;
  workDir: string;
  signal?: AbortSignal;
  onProgress?: (p: number) => Promise<void> | void;
}): Promise<RenderMeta> {
  const { plan, size, workDir: dir, signal } = opts;
  const heavy = size.W > 1920;
  const clips: string[] = [];
  const coverFile = path.join(dir, "cover.src");
  let coverReady: boolean | null = null;
  const cover = async (id?: string | null) => {
    if (!id) return null;
    if (coverReady === null) coverReady = await opts.photo(id, coverFile);
    return coverReady ? coverFile : null;
  };
  let i = 0;
  for (const s of plan.scenes) {
    if (signal?.aborted) throw new Error("cancelled");
    const frame = path.join(dir, `f${i}.jpg`);
    const clip = path.join(dir, `c${String(i).padStart(4, "0")}.mp4`);
    if (s.type === "opening" || s.type === "closing") {
      await bannerFrame(s, await cover(s.coverMediaId), size, frame);
      await encodeClip(frame, null, s.duration, size, "none", clip, signal, heavy);
    } else if (s.type === "chapter") {
      await chapterFrame(s, size, frame);
      await encodeClip(frame, null, s.duration, size, "none", clip, signal, heavy);
    } else {
      const src = path.join(dir, `p${i}.src`);
      const ok = await opts.photo(s.mediaId, src);
      if (!ok) throw new Error("A photo in the film could not be read from storage");
      // Supersample 1080p plates 2× so the zoom is smooth; 4K is already fine-grained.
      await photoFrame(src, size, heavy ? 1 : 2, frame);
      await fsp.rm(src, { force: true });
      let overlay: string | null = null;
      if (s.caption) {
        overlay = path.join(dir, `o${i}.png`);
        await captionOverlay(s.caption, size, overlay);
      }
      await encodeClip(frame, overlay, s.duration, size, s.motion, clip, signal, heavy);
    }
    await fsp.rm(frame, { force: true });
    clips.push(clip);
    i++;
    await opts.onProgress?.(0.85 * (i / plan.scenes.length));
  }
  const list = path.join(dir, "clips.txt");
  await fsp.writeFile(list, clips.map((c) => `file '${c.replace(/\\/g, "/").replace(/'/g, "'\\''")}'`).join("\n"));
  const video = path.join(dir, "video.mp4");
  await run(ffmpegPath(), ["-y", "-f", "concat", "-safe", "0", "-i", list, "-c", "copy", video], { timeoutMs: 20 * 60_000, signal });
  for (const c of clips) await fsp.rm(c, { force: true });
  await opts.onProgress?.(0.9);
  const audio = await soundtrack(dir, plan, opts.song, signal);
  await run(
    ffmpegPath(),
    [
      "-y", "-i", video, "-i", audio.file,
      "-map", "0:v:0", "-map", "1:a:0",
      "-c:v", "copy", "-c:a", "copy",
      "-t", plan.totalSeconds.toFixed(3),
      "-movflags", "+faststart",
      "-metadata", "title=Dear Swritsinh",
      opts.outFile,
    ],
    { timeoutMs: 10 * 60_000, signal },
  );
  await opts.onProgress?.(0.95);
  const meta = await verifyFilm(opts.outFile, { W: size.W, H: size.H, seconds: plan.totalSeconds });
  return { ...meta, scenes: plan.scenes.length, music: audio.label, renderedAt: new Date().toISOString() };
}

/** Worker entry point for `film.render` jobs. Returns the output storage key. */
export async function renderFilmJob(db: DB, storage: Storage, job: Job, signal: AbortSignal): Promise<string> {
  const filmId = String(job.payload.filmId);
  const resolution = job.payload.resolution === "2160p" ? "2160p" : "1080p";
  const size: Size = resolution === "2160p" ? { W: 3840, H: 2160 } : { W: 1920, H: 1080 };
  const film = (await db.select().from(schema.birthdayFilms).where(eq(schema.birthdayFilms.id, filmId)).limit(1))[0];
  if (!film) throw new Error("Film not found");
  const child = (await db.select().from(schema.childProfiles).where(eq(schema.childProfiles.id, film.childId)).limit(1))[0];
  const data = await filmData(db, child, film);
  if (data.plan.photoCount === 0) throw new Error("The film has no dated photos yet. Upload photos and confirm their dates first.");

  return withTempDir(async (dir) => {
    const photo = async (mediaId: string, dest: string) => {
      const m = (await db.select().from(schema.media).where(eq(schema.media.id, mediaId)).limit(1))[0];
      if (!m || m.childId !== child.id) return false;
      // 4K uses the original for maximum detail; 1080p uses the 2560px derivative.
      const v = (resolution === "2160p" && m.mimeDetected && ["image/jpeg", "image/png", "image/webp"].includes(m.mimeDetected)
        ? { key: m.storageKey }
        : await resolveVariant(db, m, "display")) as { key: string } | null;
      if (!v) return false;
      await download(storage, v.key, dest);
      return true;
    };
    let song: string | null = null;
    // A recorded song is only mixed into an exported file once the parent confirms the rights.
    if (data.audio?.rightsConfirmed) {
      const m = (await db.select().from(schema.media).where(eq(schema.media.id, data.audio.mediaId)).limit(1))[0];
      if (m) {
        song = path.join(dir, "song.src");
        await download(storage, m.storageKey, song);
      }
    }
    const out = path.join(dir, "film.mp4");
    const meta = await renderPlanToFile({
      plan: data.plan,
      size,
      photo,
      song,
      outFile: out,
      workDir: dir,
      signal,
      onProgress: (p) => setProgress(db, job.id, p),
    });
    const key = `${newObjectKey("films")}.mp4`;
    await storage.putFile(key, out, "video/mp4");
    const head = await storage.head(key);
    if (!head || head.bytes !== meta.bytes) throw new Error("The rendered film could not be verified in storage");
    const previous = film.renderedStorageKey;
    await db
      .update(schema.birthdayFilms)
      .set({ renderedStorageKey: key, renderedMeta: meta, verifiedAt: new Date(), status: "ready", updatedAt: new Date() })
      .where(eq(schema.birthdayFilms.id, film.id));
    if (previous && previous !== key) await storage.delete(previous).catch(() => {});
    return key;
  });
}
