import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { checkEntry, walkZip } from "@/server/imports/zip";
import { jpeg, makeZip } from "./helpers";

const limits = { maxEntries: 100, maxTotalBytes: 50 * 1024 * 1024, maxEntryBytes: 10 * 1024 * 1024, maxRatio: 200 };
let dir: string;

beforeAll(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), "zip-test-"));
});
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }));

const entry = (fileName: string, extra: Partial<{ externalFileAttributes: number; uncompressedSize: number; compressedSize: number }> = {}) => ({
  fileName,
  externalFileAttributes: (0o100644 << 16) >>> 0,
  uncompressedSize: 100,
  compressedSize: 100,
  ...extra,
});

describe("ZIP entry validation", () => {
  it("accepts nested media paths", () => {
    expect(checkEntry(entry("SWrit/2022/IMG20220416170506.jpg"), limits)).toEqual({ ok: true, name: "SWrit/2022/IMG20220416170506.jpg" });
  });
  it.each([
    ["../../etc/passwd", "Path traversal rejected"],
    ["SWrit/../../x.jpg", "Path traversal rejected"],
    ["/abs/x.jpg", "Absolute path rejected"],
    ["C:/Windows/x.jpg", "Absolute path rejected"],
    ["..\\..\\x.jpg", "Path traversal rejected"],
    ["inner/archive.zip", "Nested archives are not imported"],
  ])("rejects %s", (name, reason) => {
    expect(checkEntry(entry(name), limits)).toMatchObject({ ok: false, reason });
  });
  it("rejects symlinks", () => {
    expect(checkEntry(entry("link.jpg", { externalFileAttributes: (0o120777 << 16) >>> 0 }), limits)).toMatchObject({ ok: false, reason: "Symbolic link rejected" });
  });
  it("rejects zip-bomb ratios and oversized entries", () => {
    expect(checkEntry(entry("bomb.jpg", { uncompressedSize: 500_000_000, compressedSize: 1000 }), { ...limits, maxEntryBytes: 1e12 })).toMatchObject({ ok: false });
    expect(checkEntry(entry("big.mp4", { uncompressedSize: 11 * 1024 * 1024 }), limits)).toMatchObject({ ok: false });
  });
  it("silently skips OS metadata and folders", () => {
    expect(checkEntry(entry("__MACOSX/SWrit/._a.jpg"), limits)).toBeNull();
    expect(checkEntry(entry("SWrit/"), limits)).toBeNull();
  });
});

describe("walkZip", () => {
  it("extracts good entries and reports bad ones", async () => {
    const img = await jpeg(1);
    const file = path.join(dir, "mixed.zip");
    fs.writeFileSync(
      file,
      makeZip([
        { name: "SWrit/a.jpg", data: img },
        { name: "../evil.jpg", data: img },
        { name: "SWrit/link.jpg", data: Buffer.from("/etc/passwd"), symlink: true },
        { name: "SWrit/b.jpg", data: img },
      ]),
    );
    const got: string[] = [];
    const rejected: string[] = [];
    await walkZip(
      file,
      limits,
      async (e, extract) => {
        const dest = path.join(dir, "out", path.basename(e.name));
        await extract(dest);
        got.push(e.name);
      },
      (name) => void rejected.push(name),
    );
    expect(got).toEqual(["SWrit/a.jpg", "SWrit/b.jpg"]);
    expect(rejected.sort()).toEqual(["../evil.jpg", "SWrit/link.jpg"].sort());
    expect(fs.existsSync(path.join(dir, "evil.jpg"))).toBe(false);
  });

  it("refuses archives with too many entries", async () => {
    const file = path.join(dir, "many.zip");
    fs.writeFileSync(file, makeZip(Array.from({ length: 5 }, (_, i) => ({ name: `f${i}.jpg`, data: Buffer.from("x") }))));
    await expect(walkZip(file, { ...limits, maxEntries: 3 }, async () => {}, () => {})).rejects.toThrow(/entries/);
  });

  it("stops entries whose real size exceeds the declared size", async () => {
    const file = path.join(dir, "liar.zip");
    // Header claims 10 bytes but carries 2 MB: yauzl's size validation or our counter must stop it.
    fs.writeFileSync(file, makeZip([{ name: "liar.jpg", data: Buffer.alloc(2 * 1024 * 1024, 1), fakeSize: 10, fakeCompressedSize: 2 * 1024 * 1024 }]));
    let err: unknown = null;
    await walkZip(
      file,
      { ...limits, maxEntryBytes: 1024 * 1024 },
      async (_e, extract) => {
        try {
          await extract(path.join(dir, "liar.out"));
        } catch (e) {
          err = e;
        }
      },
      () => {},
    ).catch((e) => (err = e));
    expect(err).not.toBeNull();
  });
});

describe("ZIP name decoding", () => {
  it("decodes UTF-8 and legacy CP437 names", async () => {
    const { decodeName } = await import("@/server/imports/zip");
    expect(decodeName(Buffer.from("SWrit/ફોટો.jpg", "utf8"), 0x800)).toBe("SWrit/ફોટો.jpg");
    expect(decodeName(Buffer.from([0x41, 0x80, 0x82, 0xff]), 0)).toBe("AÇé ");
    const all = decodeName(Buffer.from(Array.from({ length: 256 }, (_, i) => i)), 0);
    expect([...all].length).toBe(256);
  });
});
