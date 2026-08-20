import type { NextRequest } from "next/server";
import { z } from "zod";
import { jsonError, jsonSuccess, jsonValidationError, newRequestId } from "@/lib/http";
import { fingerprintHash, isSameOriginRequest, requestIpHash } from "@/lib/request-context";
import { SESSION_COOKIE_NAME, sessionCookieOptions } from "@/lib/session-cookie";
import { locateFriendLogin, loginFriend } from "@/services/auth-friend";
import { lookupTenantBySlug } from "@/services/tenant-context";

const bodySchema = z.object({
  email: z.string().email().max(320),
  accessCode: z.string().regex(/^\d{8}$/, "Enter the eight-digit code"),
  /** Present when logging in from a known album (/a/:slug); absent from the
   *  marketing root, where email + code locate the album. */
  slug: z.string().max(64).optional()
});

export async function POST(request: NextRequest) {
  const requestId = newRequestId();
  if (!isSameOriginRequest(request)) {
    return jsonError("FORBIDDEN", "Cross-origin requests are not allowed", { requestId });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonValidationError(parsed.error, requestId);

  const ipHash = requestIpHash(request);
  const userAgentHash = fingerprintHash(request.headers.get("user-agent"));

  if (parsed.data.slug) {
    const tenant = await lookupTenantBySlug(parsed.data.slug);
    if (tenant.kind !== "tenant") return jsonError("NOT_FOUND", "Album not found", { requestId });

    const result = await loginFriend({
      tenant: tenant.context,
      email: parsed.data.email,
      accessCode: parsed.data.accessCode,
      ipHash,
      userAgentHash
    });
    if (result.outcome === "rate-limited") {
      return jsonError("RATE_LIMITED", "Too many attempts; try again later", { requestId });
    }
    if (result.outcome === "failure") {
      return jsonError("UNAUTHENTICATED", "Email or access code is incorrect", { requestId });
    }
    const response = jsonSuccess({ slug: result.slug }, requestId);
    response.cookies.set(SESSION_COOKIE_NAME, result.session.token, sessionCookieOptions(result.session.session.expires_at));
    return response;
  }

  // Marketing-root login: locate the album from email + code, sign in directly.
  const located = await locateFriendLogin({ email: parsed.data.email, accessCode: parsed.data.accessCode, ipHash, userAgentHash });
  if (located.outcome === "rate-limited") {
    return jsonError("RATE_LIMITED", "Too many attempts; try again later", { requestId });
  }
  if (located.outcome === "failure") {
    return jsonError("UNAUTHENTICATED", "Email or access code is incorrect", { requestId });
  }
  const response = jsonSuccess({ slug: located.slug }, requestId);
  response.cookies.set(SESSION_COOKIE_NAME, located.session.token, sessionCookieOptions(located.session.session.expires_at));
  return response;
}
