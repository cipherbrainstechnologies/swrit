import fs from "node:fs";
import path from "node:path";

/** Load .env.local / .env for CLI scripts (Next.js does this for the web app). */
export function loadEnvFiles() {
  for (const f of [".env.local", ".env"]) {
    const p = path.join(process.cwd(), f);
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(line);
      if (!m || line.trimStart().startsWith("#")) continue;
      const v = m[2].replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
      if (process.env[m[1]] === undefined) process.env[m[1]] = v;
    }
  }
}

export function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  if (i >= 0) return process.argv[i + 1];
  const eq = process.argv.find((a) => a.startsWith(`--${name}=`));
  return eq?.slice(name.length + 3);
}

export function flag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

/** Read a secret from the terminal without echoing it. */
export async function promptHidden(question: string): Promise<string> {
  const stdin = process.stdin;
  if (!stdin.isTTY) {
    throw new Error("No interactive terminal. Provide the value through an environment variable instead.");
  }
  process.stdout.write(question);
  stdin.setRawMode(true);
  stdin.resume();
  stdin.setEncoding("utf8");
  return new Promise((resolve) => {
    let value = "";
    const onData = (ch: string) => {
      for (const c of ch) {
        if (c === "\r" || c === "\n" || c === "\u0004") {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.removeListener("data", onData);
          process.stdout.write("\n");
          resolve(value);
          return;
        }
        if (c === "\u0003") process.exit(130);
        if (c === "\u007f" || c === "\b") value = value.slice(0, -1);
        else value += c;
      }
    };
    stdin.on("data", onData);
  });
}

export async function prompt(question: string): Promise<string> {
  const rl = (await import("node:readline/promises")).createInterface({ input: process.stdin, output: process.stdout });
  try {
    return (await rl.question(question)).trim();
  } finally {
    rl.close();
  }
}
