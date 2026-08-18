import { NextResponse, type NextRequest } from "next/server";
import { getPool } from "@/lib/db";
import { jsonError, newRequestId } from "@/lib/http";
import { fingerprintHash, getRequestTenant, requestIpHash } from "@/lib/request-context";
import { SESSION_COOKIE_NAME, sessionCookieOptions } from "@/lib/session-cookie";
import { consumeLoginHandoff } from "@/services/login-handoff";
import { issueSession } from "@/services/sessions";

/**
 * Completes a root-domain friend login on the tenant subdomain. This is a
 * cross-subdomain form POST by design, so instead of the same-origin check
 * the single-use, 60-second, tenant-bound token is the proof of intent.
 */
export async function POST(request: NextRequest) {
  const requestId = newRequestId();
  const tenant = await getRequestTenant(request);
  if (tenant.kind !== "tenant") {
    return jsonError("NOT_FOUND", "Album not found", { requestId });
  }

  const form = await request.formData().catch(() => null);
  const token = form?.get("token");
  if (typeof token !== "string" || token.length === 0) {
    return jsonError("UNAUTHENTICATED", "Sign in again from the start", { requestId });
  }

  const consumed = await consumeLoginHandoff(token, tenant.context.tenantId);
  if (!consumed) {
    return jsonError("UNAUTHENTICATED", "Sign in again from the start", { requestId });
  }

  const session = await issueSession(getPool(), {
    tenantId: consumed.tenantId,
    membershipId: consumed.membershipId,
    ipHash: requestIpHash(request),
    userAgentHash: fingerprintHash(request.headers.get("user-agent"))
  });

  const response = NextResponse.redirect(new URL("/", request.nextUrl), { status: 303 });
  response.cookies.set(SESSION_COOKIE_NAME, session.token, sessionCookieOptions());
  return response;
}
