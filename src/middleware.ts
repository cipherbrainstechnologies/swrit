import { NextResponse, type NextRequest } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

/**
 * Optimistic gate only: redirects visitors without a session cookie away from
 * private pages. Every page and API route still verifies the session on the server.
 */
export function middleware(req: NextRequest) {
  const cookie = getSessionCookie(req, { cookiePrefix: "dear-swritsinh" });
  if (!cookie) {
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ["/app/:path*", "/theatre/:path*"],
};
