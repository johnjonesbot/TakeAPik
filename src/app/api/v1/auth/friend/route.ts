import type { NextRequest } from "next/server";
import { z } from "zod";
import { jsonError, jsonSuccess, jsonValidationError, newRequestId } from "@/lib/http";
import { fingerprintHash, getRequestTenant, isSameOriginRequest, requestIpHash } from "@/lib/request-context";
import { SESSION_COOKIE_NAME, sessionCookieOptions } from "@/lib/session-cookie";
import { locateFriendLogin, loginFriend } from "@/services/auth-friend";

const bodySchema = z.object({
  email: z.string().email().max(320),
  accessCode: z.string().regex(/^\d{8}$/, "Enter the eight-digit code")
});

export async function POST(request: NextRequest) {
  const requestId = newRequestId();
  if (!isSameOriginRequest(request)) {
    return jsonError("FORBIDDEN", "Cross-origin requests are not allowed", { requestId });
  }

  const tenant = await getRequestTenant(request);
  if (tenant.kind === "unavailable") {
    return jsonError("NOT_FOUND", "Album not found", { requestId });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonValidationError(parsed.error, requestId);

  if (tenant.kind === "root") {
    // Root-domain login: locate the album from all three factors and hand the
    // browser to the tenant subdomain, where the session cookie can be set.
    const located = await locateFriendLogin({
      email: parsed.data.email,
      accessCode: parsed.data.accessCode,
      ipHash: requestIpHash(request)
    });
    if (located.outcome === "rate-limited") {
      return jsonError("RATE_LIMITED", "Too many attempts; try again later", { requestId });
    }
    if (located.outcome === "failure") {
      return jsonError("UNAUTHENTICATED", "Email or access code is incorrect", { requestId });
    }
    const rootDomain = request.headers.get("host") ?? "";
    const protocol = request.nextUrl.protocol;
    return jsonSuccess(
      {
        handoff: {
          token: located.handoff.token,
          action: `${protocol}//${located.handoff.tenantSlug}.${rootDomain}/api/v1/auth/friend/handoff`
        }
      },
      requestId
    );
  }

  const result = await loginFriend({
    tenant: tenant.context,
    email: parsed.data.email,
    accessCode: parsed.data.accessCode,
    ipHash: requestIpHash(request),
    userAgentHash: fingerprintHash(request.headers.get("user-agent"))
  });

  if (result.outcome === "rate-limited") {
    return jsonError("RATE_LIMITED", "Too many attempts; try again later", { requestId });
  }
  if (result.outcome === "failure") {
    return jsonError("UNAUTHENTICATED", "Email or access code is incorrect", { requestId });
  }

  const response = jsonSuccess({ actor: { kind: "friend", membershipId: result.membershipId } }, requestId);
  response.cookies.set(SESSION_COOKIE_NAME, result.session.token, sessionCookieOptions());
  return response;
}
