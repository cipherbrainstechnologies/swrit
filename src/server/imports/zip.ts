import fs from "node:fs";
import path from "node:path";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import yauzl from "yauzl";

/**
 * Defensive ZIP reading. We never trust header sizes: actual inflated bytes are
 * counted while streaming and the entry is aborted as soon as a limit is crossed.
 */

export type ZipLimits = {
  maxEntries: number;
  maxTotalBytes: number;
  maxEntryBytes: number;
  maxRatio: number; // uncompressed / compressed, for entries above 1 MB
};

export type ZipEntryInfo = { name: string; size: number; compressedSize: number };

export type EntryVerdict = { ok: true; name: string } | { ok: false; name: string; reason: string };

const S_IFMT = 0o170000;
const S_IFLNK = 0o120000;

/** Validate an entry name/metadata before extracting anything. */
export function checkEntry(entry: {
  fileName: string;
  externalFileAttributes: number;
  uncompressedSize: number;
  compressedSize: number;
}, limits: ZipLimits): EntryVerdict | null {
  const name = entry.fileName;
  if (name.endsWith("/")) return null; // directory
  if (name.includes("\0")) return { ok: false, name, reason: "Invalid file name" };
  const normalised = name.replace(/\\/g, "/");
  if (normalised.startsWith("/") || /^[a-zA-Z]:/.test(normalised)) {
    return { ok: false, name, reason: "Absolute path rejected" };
  }
  if (normalised.split("/").some((seg) => seg === "..")) {
    return { ok: false, name, reason: "Path traversal rejected" };
  }
  const mode = (entry.externalFileAttributes >>> 16) & 0xffff;
  if ((mode & S_IFMT) === S_IFLNK) return { ok: false, name, reason: "Symbolic link rejected" };
  const base = normalised.split("/").pop() ?? "";
  if (normalised.startsWith("__MACOSX/") || base.startsWith("._") || base === ".DS_Store" || base === "Thumbs.db") {
    return null; // OS metadata, silently skipped
  }
  if (/\.(zip|7z|rar|tar|gz|tgz)$/i.test(base)) return { ok: false, name, reason: "Nested archives are not imported" };
  if (entry.uncompressedSize > limits.maxEntryBytes) return { ok: false, name, reason: "File is larger than the upload limit" };
  if (
    entry.uncompressedSize > 1_000_000 &&
    entry.compressedSize > 0 &&
    entry.uncompressedSize / entry.compressedSize > limits.maxRatio
  ) {
    return { ok: false, name, reason: "Suspicious compression ratio (possible zip bomb)" };
  }
  return { ok: true, name: normalised };
}

/** CP437 code points for bytes 0x80-0xFF (bytes below 0x80 are ASCII). */
const CP437_HIGH =
  "\u00c7\u00fc\u00e9\u00e2\u00e4\u00e0\u00e5\u00e7\u00ea\u00eb\u00e8\u00ef\u00ee\u00ec\u00c4\u00c5\u00c9\u00e6\u00c6\u00f4\u00f6\u00f2\u00fb\u00f9\u00ff\u00d6\u00dc\u00a2\u00a3\u00a5\u20a7\u0192\u00e1\u00ed\u00f3\u00fa\u00f1\u00d1\u00aa\u00ba\u00bf\u2310\u00ac\u00bd\u00bc\u00a1\u00ab\u00bb\u2591\u2592\u2593\u2502\u2524\u2561\u2562\u2556\u2555\u2563\u2551\u2557\u255d\u255c\u255b\u2510\u2514\u2534\u252c\u251c\u2500\u253c\u255e\u255f\u255a\u2554\u2569\u2566\u2560\u2550\u256c\u2567\u2568\u2564\u2565\u2559\u2558\u2552\u2553\u256b\u256a\u2518\u250c\u2588\u2584\u258c\u2590\u2580\u03b1\u00df\u0393\u03c0\u03a3\u03c3\u00b5\u03c4\u03a6\u0398\u03a9\u03b4\u221e\u03c6\u03b5\u2229\u2261\u00b1\u2265\u2264\u2320\u2321\u00f7\u2248\u00b0\u2219\u00b7\u221a\u207f\u00b2\u25a0\u00a0";

/** UTF-8 when the archive says so (bit 11), otherwise the legacy CP437 code page. */
export function decodeName(buf: Buffer, flags: number): string {
  if (flags & 0x800) return buf.toString("utf8");
  let out = "";
  for (const b of buf) out += b < 0x80 ? String.fromCharCode(b) : CP437_HIGH[b - 0x80];
  return out;
}

function openZip(file: string): Promise<yauzl.ZipFile> {
  return new Promise((resolve, reject) =>
    // decodeStrings:false so one malicious name does not abort the whole archive in yauzl;
    // names are decoded and validated by checkEntry instead.
    yauzl.open(file, { lazyEntries: true, autoClose: false, decodeStrings: false, validateEntrySizes: true }, (err, zf) =>
      err || !zf ? reject(err ?? new Error("Could not open ZIP")) : resolve(zf),
    ),
  );
}

export type ZipVisitor = (
  entry: { name: string; size: number },
  extractTo: (dest: string) => Promise<number>,
) => Promise<void>;

/**
 * Iterate entries sequentially. `onReject` receives entries refused by validation.
 * Throws if the archive as a whole exceeds limits.
 */
export async function walkZip(
  file: string,
  limits: ZipLimits,
  visit: ZipVisitor,
  onReject: (name: string, reason: string) => Promise<void> | void,
  onCount?: (total: number) => Promise<void> | void,
): Promise<void> {
  const zf = await openZip(file);
  try {
    if (zf.entryCount > limits.maxEntries) {
      throw new Error(`ZIP has ${zf.entryCount} entries; the limit is ${limits.maxEntries}`);
    }
    await onCount?.(zf.entryCount);
    let totalBytes = 0;
    await new Promise<void>((resolve, reject) => {
      zf.on("error", reject);
      zf.on("end", resolve);
      zf.on("entry", (entry: yauzl.Entry) => {
        (async () => {
          const raw = entry.fileName as unknown as Buffer | string;
          const fileName = typeof raw === "string" ? raw : decodeName(raw, entry.generalPurposeBitFlag);
          const verdict = checkEntry({ ...entry, fileName, externalFileAttributes: entry.externalFileAttributes, uncompressedSize: entry.uncompressedSize, compressedSize: entry.compressedSize }, limits);
          if (!verdict) return;
          if (!verdict.ok) return void (await onReject(verdict.name, verdict.reason));
          if (totalBytes + entry.uncompressedSize > limits.maxTotalBytes) {
            throw new Error("ZIP expands beyond the total size limit");
          }
          const extractTo = (dest: string) =>
            new Promise<number>((res, rej) => {
              zf.openReadStream(entry, (err, rs) => {
                if (err || !rs) return rej(err ?? new Error("Could not read entry"));
                let seen = 0;
                const counter = new Transform({
                  transform(chunk: Buffer, _enc, cb) {
                    seen += chunk.length;
                    if (seen > limits.maxEntryBytes || totalBytes + seen > limits.maxTotalBytes) {
                      cb(new Error("Entry exceeded size limits while extracting"));
                      return;
                    }
                    cb(null, chunk);
                  },
                });
                fs.mkdirSync(path.dirname(dest), { recursive: true });
                pipeline(rs, counter, fs.createWriteStream(dest))
                  .then(() => {
                    totalBytes += seen;
                    res(seen);
                  })
                  .catch(rej);
              });
            });
          await visit({ name: verdict.name, size: entry.uncompressedSize }, extractTo);
        })()
          .then(() => zf.readEntry())
          .catch(reject);
      });
      zf.readEntry();
    });
  } finally {
    zf.close();
  }
}
