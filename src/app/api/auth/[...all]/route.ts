import { getAuth } from "@/server/auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

async function handle(req: Request) {
  const auth = await getAuth();
  const res = await auth.handler(req);
  const h = new Headers(res.headers);
  h.set("Cache-Control", "private, no-store");
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers: h });
}

export const GET = handle;
export const POST = handle;
