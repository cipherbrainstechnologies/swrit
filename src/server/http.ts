import { errorResponse, HttpError } from "./access";

type Ctx<P> = { params: Promise<P> };

/** Wrap a route handler with uniform error handling (no stack traces to the client). */
export function route<P = Record<string, string>>(
  fn: (req: Request, params: P) => Promise<Response>,
): (req: Request, ctx: Ctx<P>) => Promise<Response> {
  return async (req, ctx) => {
    try {
      return await fn(req, (await ctx?.params) ?? ({} as P));
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export async function readJson(req: Request, maxBytes = 64 * 1024): Promise<unknown> {
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > maxBytes) throw new HttpError(413, "too_large", "Request body too large.");
  const text = await req.text();
  if (text.length > maxBytes) throw new HttpError(413, "too_large", "Request body too large.");
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new HttpError(400, "invalid_json", "Invalid JSON.");
  }
}

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function assertUuid(id: string): string {
  if (!UUID_RE.test(id)) throw new HttpError(404, "not_found", "Not found.");
  return id;
}
