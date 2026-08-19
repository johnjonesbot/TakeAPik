import { NextRequest, NextResponse } from "next/server";

/**
 * Security headers for the single-origin app (ADR-005). All albums share the
 * takeapik.com origin, so a strict, per-request nonce Content-Security-Policy
 * is the front line against script injection stealing another album's data —
 * alongside HttpOnly cookies and the session-scoped tenant checks in the app.
 */
function buildCsp(nonce: string): string {
  return [
    "default-src 'self'",
    // 'strict-dynamic' + nonce: only our nonced bootstrap (and what it loads)
    // runs; injected inline scripts are refused.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`,
    // Next injects inline <style>; keep style-src permissive but scripts strict.
    "style-src 'self' 'unsafe-inline'",
    // Photos come from private object storage over https (signed URLs) and the
    // in-browser preview uses blob:; the brand images are same-origin.
    "img-src 'self' data: blob: https:",
    "font-src 'self'",
    "connect-src 'self'",
    "media-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "upgrade-insecure-requests"
  ].join("; ");
}

export function proxy(request: NextRequest) {
  // Canonicalize to the single https origin (ADR-005). The platform edge no
  // longer forces HTTPS (its Force-HTTPS feature replaced our CSP), so the
  // proxy owns both redirects: plain HTTP → https, and www → apex. The public
  // host must come from the forwarded/Host header — request.url reflects the
  // internal listen address. Forwarded headers are only meaningful behind the
  // production proxy (TRUST_PROXY, same rule as request-context); the Node
  // server itself stamps x-forwarded-proto=http locally, which must not
  // redirect plain-HTTP localhost onto a TLS port that doesn't exist.
  const trustProxy = process.env.TRUST_PROXY === "true";
  const forwardedProto = trustProxy ? request.headers.get("x-forwarded-proto") : null;
  const host = (trustProxy ? request.headers.get("x-forwarded-host") : null) ?? request.headers.get("host");
  if (host) {
    const canonicalHost = host.startsWith("www.") ? host.slice(4) : host;
    const insecure = forwardedProto !== null && forwardedProto !== "https";
    if (insecure || canonicalHost !== host) {
      const { pathname, search } = request.nextUrl;
      return NextResponse.redirect(`https://${canonicalHost}${pathname}${search}`, 308);
    }
  }

  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const nonce = btoa(String.fromCharCode(...bytes));
  const csp = buildCsp(nonce);

  // Pass the nonce (and CSP) to the app so Next tags its own scripts with it.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("content-security-policy", csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("content-security-policy", csp);
  response.headers.set("x-content-type-options", "nosniff");
  response.headers.set("referrer-policy", "strict-origin-when-cross-origin");
  response.headers.set("permissions-policy", "camera=(self), geolocation=(), microphone=()");
  response.headers.set("x-frame-options", "DENY");
  response.headers.set("cross-origin-opener-policy", "same-origin");
  response.headers.set("cross-origin-resource-policy", "same-origin");
  // HSTS: force HTTPS for two years, subdomains included. Safe because the app
  // is HTTPS-only in production.
  response.headers.set("strict-transport-security", "max-age=63072000; includeSubDomains; preload");
  return response;
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
