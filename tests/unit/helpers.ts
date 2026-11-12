import zlib from "node:zlib";
import sharp from "sharp";

/** Minimal ZIP writer (stored entries) that can produce deliberately malicious archives. */
export function makeZip(
  entries: { name: string; data: Buffer; symlink?: boolean; fakeSize?: number; fakeCompressedSize?: number }[],
): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name, "utf8");
    const crc = zlib.crc32(e.data) >>> 0;
    const size = e.fakeSize ?? e.data.length;
    const csize = e.fakeCompressedSize ?? e.data.length;
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(0, 8); // stored
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(csize, 18);
    local.writeUInt32LE(size, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, e.data);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(0x0314, 4); // made by unix
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(csize, 20);
    central.writeUInt32LE(size, 24);
    central.writeUInt16LE(name.length, 28);
    const mode = e.symlink ? 0o120777 : 0o100644;
    central.writeUInt32LE((mode << 16) >>> 0, 38);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);
    offset += 30 + name.length + e.data.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

/** A unique, valid JPEG (colour varies with `seed`). */
export async function jpeg(seed: number, w = 640, h = 480): Promise<Buffer> {
  return sharp({
    create: { width: w, height: h, channels: 3, background: { r: (seed * 53) % 255, g: (seed * 97) % 255, b: (seed * 31) % 255 } },
  })
    .composite([
      {
        input: Buffer.from(`<svg width="${w}" height="${h}"><circle cx="${(seed * 37) % w}" cy="${h / 2}" r="${h / 4}" fill="#fff"/></svg>`),
      },
    ])
    .jpeg({ quality: 85 })
    .toBuffer();
}
