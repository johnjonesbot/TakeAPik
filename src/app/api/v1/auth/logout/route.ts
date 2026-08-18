import type { NextRequest } from "next/server";
import { getPool } from "@/lib/db";
import { jsonError, jsonSuccess, newRequestId } from "@/lib/http";
import { getRequestActor, isSameOriginRequest, requestIpHash } from "@/lib/request-context";
import { SESSION_COOKIE_NAME, clearedSessionCookieOptions } from "@/lib/session-cookie";
import { writeAuditEvent } from "@/services/audit";
import { revokeSessionByToken } from "@/services/sessions";

export async function POST(request: NextRequest) {
  const requestId = newRequestId();
  if (!isSameOriginRequest(request)) {
    return jsonError("FORBIDDEN", "Cross-origin requests are not allowed", { requestId });
  }

  const token = request.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (token) {
    const actor = await getRequestActor(request);
    await revokeSessionByToken(token);
    if (actor) {
      await writeAuditEvent(getPool(), {
        tenantId: actor.kind === "super-admin" ? undefined : actor.tenantId,
        actorMembershipId: actor.kind === "super-admin" ? undefined : actor.membershipId,
        actorPlatformUserId: actor.kind === "friend" ? undefined : actor.platformUserId,
        action: "auth.logout",
        targetType: "session",
        targetId: actor.sessionId,
        ipHash: requestIpHash(request)
      });
    }
  }

  const response = jsonSuccess({ loggedOut: true }, requestId);
  response.cookies.set(SESSION_COOKIE_NAME, "", clearedSessionCookieOptions());
  return response;
}
