import type { NextRequest } from "next/server";
import { z } from "zod";
import { jsonError, jsonSuccess, jsonValidationError, newRequestId } from "@/lib/http";
import { fingerprintHash, isSameOriginRequest, requestIpHash } from "@/lib/request-context";
import { SESSION_COOKIE_NAME, sessionCookieOptions } from "@/lib/session-cookie";
import { loginAdmin } from "@/services/auth-admin";
import { lookupTenantBySlug } from "@/services/tenant-context";

const bodySchema = z.object({
  email: z.string().email().max(320),
  password: z.string().min(1).max(1024),
  totpCode: z.string().regex(/^\d{6}$/).optional(),
  /** Album slug for an event-admin login; absent for the super-admin portal. */
  slug: z.string().max(64).optional()
});

export async function POST(request: NextRequest) {
  const requestId = newRequestId();
  if (!isSameOriginRequest(request)) {
    return jsonError("FORBIDDEN", "Cross-origin requests are not allowed", { requestId });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonValidationError(parsed.error, requestId);

  let tenant;
  if (parsed.data.slug) {
    const lookup = await lookupTenantBySlug(parsed.data.slug);
    if (lookup.kind !== "tenant") return jsonError("NOT_FOUND", "Album not found", { requestId });
    tenant = lookup.context;
  }

  const result = await loginAdmin({
    tenant,
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

  const response = jsonSuccess({ actor: { kind: tenant ? "admin" : "super-admin" } }, requestId);
  response.cookies.set(SESSION_COOKIE_NAME, result.session.token, sessionCookieOptions(result.session.session.expires_at));
  return response;
}
