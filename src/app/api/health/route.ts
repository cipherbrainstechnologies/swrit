export const dynamic = "force-dynamic";

/** Liveness only. Never exposes configuration, secrets or child data. */
export function GET() {
  return new Response(JSON.stringify({ ok: true }), {
    headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
  });
}
