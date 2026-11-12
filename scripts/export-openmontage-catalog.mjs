/**
 * Reads pipeline manifests and declared tool providers from a pinned
 * OpenMontage checkout. Writes src/studio/upstream-catalog.json.
 *
 * Usage: node scripts/export-openmontage-catalog.mjs <openmontage-root>
 */
import fs from "node:fs";
import path from "node:path";

const root = process.argv[2];
if (!root) {
  console.error("Pass the OpenMontage checkout path.");
  process.exit(1);
}

function read(file) {
  return fs.readFileSync(file, "utf8");
}

function field(text, key) {
  const m = text.match(new RegExp(`^${key}:\\s*>?\\s*\\n([\\s\\S]*?)(?=\\n[a-z_]+:|\\n#|$)`, "m"));
  if (m) return m[1].replace(/\n\s*/g, " ").trim();
  const one = text.match(new RegExp(`^${key}:\\s*"?([^"\\n]+)"?`, "m"));
  return one ? one[1].trim() : "";
}

const defsDir = path.join(root, "pipeline_defs");
const pipelines = fs
  .readdirSync(defsDir)
  .filter((name) => name.endsWith(".yaml"))
  .map((name) => {
    const text = read(path.join(defsDir, name));
    const stages = [...text.matchAll(/- name:\s*([a-z0-9_]+)/g)].map((m) => m[1]);
    const tools = [...text.matchAll(/^\s+- ([a-z0-9_]+)\s*$/gm)].map((m) => m[1]);
    return {
      name: field(text, "name") || name.replace(/\.yaml$/, ""),
      version: field(text, "version").replace(/"/g, ""),
      description: field(text, "description"),
      category: field(text, "category"),
      stability: field(text, "stability"),
      checkpointPolicy: field(text, "default_checkpoint_policy"),
      stages,
      tools: [...new Set(tools)].filter((tool) => !["name", "true", "false"].includes(tool)),
      referenceSupported: /reference_input:[\s\S]*?supported:\s*true/.test(text),
    };
  })
  .sort((a, b) => a.name.localeCompare(b.name));

const providerHits = [];
function walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "__pycache__" || entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith(".py")) {
      const text = read(full);
      const name = text.match(/^\s+name\s*=\s*"([^"]+)"/m)?.[1];
      const provider = text.match(/^\s+provider\s*=\s*"([^"]+)"/m)?.[1];
      const capability = text.match(/^\s+capability\s*=\s*"([^"]+)"/m)?.[1];
      if (name && provider) providerHits.push({ tool: name, provider, capability: capability ?? "unspecified", local: /local|ffmpeg|remotion|piper/i.test(provider) });
    }
  }
}
walk(path.join(root, "tools"));

const profiles = [...read(path.join(root, "lib", "media_profiles.py")).matchAll(/name="([^"]+)",\s*\n\s*width=(\d+), height=(\d+)/g)].map((m) => ({
  name: m[1],
  width: Number(m[2]),
  height: Number(m[3]),
}));

const commit = process.env.OPENMONTAGE_COMMIT || "";
const catalog = {
  commit,
  repository: "https://github.com/OpenMontageInc/OpenMontage",
  license: "AGPL-3.0",
  pipelines,
  profiles,
  providers: providerHits.sort((a, b) => a.tool.localeCompare(b.tool)),
};

const out = path.join(process.cwd(), "src", "studio", "upstream-catalog.json");
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, JSON.stringify(catalog, null, 2));
console.log(`pipelines=${pipelines.length} providers=${providerHits.length} profiles=${profiles.length}`);
