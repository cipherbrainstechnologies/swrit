import { spawn } from "node:child_process";
import { env } from "../env";


export function ffmpegPath(): string {
  const configured = env().FFMPEG_PATH;
  if (configured) return configured;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const p = require("ffmpeg-static") as string | null;
    if (p) return p;
  } catch {
    /* fall through */
  }
  return "ffmpeg";
}

export function ffprobePath(): string {
  const configured = env().FFPROBE_PATH;
  if (configured) return configured;
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return (require("@ffprobe-installer/ffprobe") as { path: string }).path;
  } catch {
    return "ffprobe";
  }
}

export type RunOptions = { timeoutMs?: number; signal?: AbortSignal; onStderr?: (line: string) => void };

export function run(bin: string, args: string[], opts: RunOptions = {}): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    const timer = opts.timeoutMs
      ? setTimeout(() => {
          child.kill("SIGKILL");
          reject(new Error(`${bin.split(/[\\/]/).pop()} timed out`));
        }, opts.timeoutMs)
      : null;
    const onAbort = () => child.kill("SIGKILL");
    opts.signal?.addEventListener("abort", onAbort);
    child.stdout.on("data", (c: Buffer) => {
      stdout += c.toString();
      if (stdout.length > 4_000_000) stdout = stdout.slice(-2_000_000);
    });
    child.stderr.on("data", (c: Buffer) => {
      const s = c.toString();
      stderr += s;
      if (stderr.length > 200_000) stderr = stderr.slice(-100_000);
      if (opts.onStderr) for (const line of s.split(/\r?\n|\r/)) if (line) opts.onStderr(line);
    });
    child.on("error", (err) => {
      if (timer) clearTimeout(timer);
      reject(err);
    });
    child.on("close", (code) => {
      if (timer) clearTimeout(timer);
      opts.signal?.removeEventListener("abort", onAbort);
      if (opts.signal?.aborted) return reject(new Error("cancelled"));
      if (code === 0) resolve({ stdout, stderr });
      else reject(new Error(`${bin.split(/[\\/]/).pop()} exited with code ${code}: ${stderr.slice(-600)}`));
    });
  });
}

export type ProbeStream = {
  codec_type: "video" | "audio" | string;
  codec_name?: string;
  width?: number;
  height?: number;
  pix_fmt?: string;
  r_frame_rate?: string;
  avg_frame_rate?: string;
  duration?: string;
  channels?: number;
  tags?: Record<string, string>;
  side_data_list?: { rotation?: number }[];
};

export type Probe = {
  streams: ProbeStream[];
  format: { duration?: string; format_name?: string; bit_rate?: string; tags?: Record<string, string> };
};

export async function ffprobe(file: string): Promise<Probe> {
  const { stdout } = await run(
    ffprobePath(),
    ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", file],
    { timeoutMs: 60_000 },
  );
  return JSON.parse(stdout) as Probe;
}

export function frameRate(s?: string): number {
  if (!s) return 0;
  const [a, b] = s.split("/").map(Number);
  return b ? a / b : a;
}
