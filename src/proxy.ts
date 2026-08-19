import { NextRequest, NextResponse } from "next/server";
import { albumsUrl, isAlbumsHost, mainUrl } from "@/lib/hosts";

/**
 * Surface separation (ADR-004):
 *   - Album paths (/a/*) exist ONLY on albums.takeapik.com. On the main domain
 *     they redirect to the albums subdomain, so no album ever appears there.
 *   - The super-admin portal exists ONLY on the main domain. On the albums
 *     subdomain it redirects back to the main domain.
 * API routes and static assets are served on both.
 */
export function proxy(request: NextRequest) {
  const host = request.headers.get("host") ?? "";
  const { pathname, search } = request.nextUrl;

  let response: NextResponse | undefined;
  if (isAlbumsHost(host)) {
    if (pathname === "/super-admin" || pathname.startsWith("/super-admin/")) {
      response = NextResponse.redirect(mainUrl(pathname + search));
    }
  } else {
    if (pathname === "/a" || pathname.startsWith("/a/")) {
      response = NextResponse.redirect(albumsUrl(pathname + search));
    }
  }

  response = response ?? NextResponse.next();
  response.headers.set("x-content-type-options", "nosniff");
  response.headers.set("referrer-policy", "strict-origin-when-cross-origin");
  response.headers.set("permissions-policy", "camera=(self), geolocation=(), microphone=()");
  return response;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
