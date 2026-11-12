import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import sharp from "sharp";

export const FIXTURES = path.resolve("tests/.tmp/e2e/fixtures");

/** Synthetic test images only. Real family photos are never used in tests. */
export async function makeJpeg(name: string, seed: number, w: number, h: number): Promise<string> {
  fs.mkdirSync(FIXTURES, { recursive: true });
  const file = path.join(FIXTURES, name);
  await sharp({ create: { width: w, height: h, channels: 3, background: { r: (seed * 70) % 255, g: (seed * 40) % 255, b: (seed * 90) % 255 } } })
    .composite([{ input: Buffer.from(`<svg width="${w}" height="${h}"><circle cx="${w / 2}" cy="${h / 2}" r="${Math.min(w, h) / 3}" fill="#f7f4ed"/><text x="20" y="60" font-size="48" fill="#101a2b">${seed}</text></svg>`) }])
    .jpeg({ quality: 85 })
    .toFile(file);
  return file;
}

export function makeMp4(name: string): string {
  fs.mkdirSync(FIXTURES, { recursive: true });
  const file = path.join(FIXTURES, name);
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ffmpeg = require("ffmpeg-static") as string;
  execFileSync(ffmpeg, [
    "-y", "-v", "error",
    "-f", "lavfi", "-i", "testsrc=size=640x360:rate=24:duration=2",
    "-f", "lavfi", "-i", "sine=frequency=440:duration=2",
    "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", "-shortest", "-movflags", "+faststart",
    file,
  ]);
  return file;
}

/** Stored-entry ZIP builder (lets us include a path-traversal entry on purpose). */
export function makeZip(name: string, entries: { name: string; file?: string; data?: Buffer }[]): string {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const data = e.data ?? fs.readFileSync(e.file!);
    const n = Buffer.from(e.name);
    const crc = zlib.crc32(data) >>> 0;
    const l = Buffer.alloc(30);
    l.writeUInt32LE(0x04034b50, 0);
    l.writeUInt16LE(20, 4);
    l.writeUInt16LE(0x0800, 6);
    l.writeUInt32LE(crc, 14);
    l.writeUInt32LE(data.length, 18);
    l.writeUInt32LE(data.length, 22);
    l.writeUInt16LE(n.length, 26);
    locals.push(l, n, data);
    const c = Buffer.alloc(46);
    c.writeUInt32LE(0x02014b50, 0);
    c.writeUInt16LE(0x0314, 4);
    c.writeUInt16LE(20, 6);
    c.writeUInt16LE(0x0800, 8);
    c.writeUInt32LE(crc, 16);
    c.writeUInt32LE(data.length, 20);
    c.writeUInt32LE(data.length, 24);
    c.writeUInt16LE(n.length, 28);
    c.writeUInt32LE(((0o100644 << 16) >>> 0), 38);
    c.writeUInt32LE(offset, 42);
    centrals.push(c, n);
    offset += 30 + n.length + data.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  const file = path.join(FIXTURES, name);
  fs.writeFileSync(file, Buffer.concat([...locals, cd, end]));
  return file;
}
