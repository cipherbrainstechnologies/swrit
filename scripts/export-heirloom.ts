import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import { arg, loadEnvFiles } from "./_cli";

loadEnvFiles();

/**
 * One-click heirloom export: every original binary, rendered films, a metadata
 * manifest (JSON + CSV) and a SHA-256 checksum list, written to a local folder.
 *
 *   pnpm export:heirloom --out ./exports
 */
async function main() {
  const outRoot = path.resolve(arg("out") ?? "./exports");
  const { getDb, schema, closeDb } = await import("../src/server/db");
  const { getStorage } = await import("../src/server/storage");
  const db = await getDb();
  const storage = await getStorage();
  const child = (await db.select().from(schema.childProfiles).limit(1))[0];
  if (!child) throw new Error("No archive found.");
  const stamp = new Date().toISOString().slice(0, 10);
  const out = path.join(outRoot, `dear-swritsinh-${stamp}`);
  fs.mkdirSync(path.join(out, "originals"), { recursive: true });
  fs.mkdirSync(path.join(out, "films"), { recursive: true });

  const media = await db.select().from(schema.media);
  const films = await db.select().from(schema.birthdayFilms);
  const albums = await db.select().from(schema.albums);
  const albumMedia = await db.select().from(schema.albumMedia);
  const sums: string[] = [];
  const used = new Set<string>();
  const safe = (s: string) => s.replace(/[^\w.\- ]+/g, "_").slice(0, 120);

  let n = 0;
  for (const m of media) {
    const date = m.capturedAt ? m.capturedAt.toISOString().slice(0, 10) : "undated";
    let name = `${date}_${safe(m.filenameOriginal)}`;
    while (used.has(name)) name = `${date}_${m.id.slice(0, 8)}_${safe(m.filenameOriginal)}`;
    used.add(name);
    const dest = path.join(out, "originals", name);
    const hash = crypto.createHash("sha256");
    const s = await storage.getStream(m.storageKey);
    s.on("data", (c: Buffer) => hash.update(c));
    await pipeline(s, fs.createWriteStream(dest));
    const digest = hash.digest("hex");
    if (m.sha256 && m.sha256 !== digest) console.warn(`WARNING checksum mismatch for ${name}`);
    sums.push(`${digest}  originals/${name}`);
    (m as typeof m & { exportPath?: string }).exportPath = `originals/${name}`;
    process.stdout.write(`\r${++n}/${media.length} originals`);
  }
  for (const f of films.filter((f) => f.renderedStorageKey)) {
    const name = `${safe(f.title)}.mp4`;
    const dest = path.join(out, "films", name);
    const hash = crypto.createHash("sha256");
    const s = await storage.getStream(f.renderedStorageKey!);
    s.on("data", (c: Buffer) => hash.update(c));
    await pipeline(s, fs.createWriteStream(dest));
    sums.push(`${hash.digest("hex")}  films/${name}`);
  }

  const manifest = {
    format: "dear-swritsinh-heirloom/1",
    exportedAt: new Date().toISOString(),
    child: { fullName: child.fullName, preferredName: child.preferredName, birthDate: child.birthDate, birthDateConfirmed: child.birthDateConfirmed, timezone: child.timezone },
    media: media.map((m) => ({
      id: m.id,
      file: (m as typeof m & { exportPath?: string }).exportPath,
      originalName: m.filenameOriginal,
      kind: m.kind,
      mime: m.mimeDetected,
      bytes: m.bytes,
      sha256: m.sha256,
      capturedAt: m.capturedAt?.toISOString() ?? null,
      capturedSource: m.capturedSource,
      capturedConfidence: m.capturedConfidence,
      caption: m.caption,
      story: m.story,
      favorite: m.favorite,
      deleted: !!m.deletedAt,
      legacyFilm: m.isLegacyFilm,
    })),
    albums: albums.map((a) => ({ name: a.name, description: a.description, mediaIds: albumMedia.filter((x) => x.albumId === a.id).map((x) => x.mediaId) })),
    films: films.map((f) => ({ id: f.id, title: f.title, source: f.source, renderedMeta: f.renderedMeta })),
  };
  fs.writeFileSync(path.join(out, "manifest.json"), JSON.stringify(manifest, null, 2));
  const csvEsc = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  fs.writeFileSync(
    path.join(out, "media.csv"),
    ["file,captured_at,date_source,caption,favorite,sha256", ...manifest.media.map((m) => [m.file, m.capturedAt, m.capturedSource, m.caption, m.favorite, m.sha256].map(csvEsc).join(","))].join("\n"),
  );
  fs.writeFileSync(path.join(out, "SHA256SUMS.txt"), sums.join("\n") + "\n");
  fs.writeFileSync(
    path.join(out, "README.txt"),
    "Dear Swritsinh heirloom export.\n\noriginals/  every photo and video exactly as uploaded\nfilms/      rendered birthday films\nmanifest.json, media.csv  dates, captions, albums\nSHA256SUMS.txt  verify with: sha256sum -c SHA256SUMS.txt\n",
  );
  console.log(`\nExport written to ${out}`);
  await closeDb();
}

main().catch((err) => {
  console.error("Export failed:", err instanceof Error ? err.message : err);
  process.exit(1);
});
