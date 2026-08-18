import type { NextRequest } from "next/server";
import { z } from "zod";
import { jsonError, jsonSuccess, jsonValidationError, newRequestId } from "@/lib/http";
import { fingerprintHash, getRequestTenant, isSameOriginRequest, requestIpHash } from "@/lib/request-context";
import { SESSION_COOKIE_NAME, sessionCookieOptions } from "@/lib/session-cookie";
import { loginAdmin } from "@/services/auth-admin";

const bodySchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(1).max(1024),
  totpCode: z.string().regex(/^\d{6}$/).optional()
});

/**
 * Admin login. On a tenant host this signs in the event admin; on the root
 * host it signs in a super-admin (MFA mandatory).
 */
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

  const result = await loginAdmin({
    tenant: tenant.kind === "tenant" ? tenant.context : undefined,
    email: parsed.data.email,
    password: parsed.data.password,
    totpCode: parsed.data.totpCode,
    ipHash: requestIpHash(request),
    userAgentHash: fingerprintHash(request.headers.get("user-agent"))
  });

  if (result.outcome === "rate-limited") {
    return jsonError("RATE_LIMITED", "Too many attempts; try again later", { requestId });
  }
  if (result.outcome === "mfa-required") {
    return jsonSuccess({ mfaRequired: true }, requestId);
  }
  if (result.outcome === "failure") {
    return jsonError("UNAUTHENTICATED", "Email, password, or code is incorrect", { requestId });
  }

  const kind = tenant.kind === "tenant" ? "admin" : "super-admin";
  const response = jsonSuccess({ actor: { kind } }, requestId);
  response.cookies.set(SESSION_COOKIE_NAME, result.session.token, sessionCookieOptions());
  return response;
}
