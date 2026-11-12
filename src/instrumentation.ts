/**
 * Runs once per Next.js server process. Locally (PGlite) the background worker
 * shares the web process; on Railway it runs as its own service.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./instrumentation-node");
  }
}
