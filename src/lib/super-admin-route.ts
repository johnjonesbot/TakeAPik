import type { NextRequest, NextResponse } from "next/server";
import { jsonError } from "@/lib/http";
import { getAuthorizedActor, isSameOriginRequest } from "@/lib/request-context";
import type { SuperAdminActor } from "@/services/platform-admin";

export type SuperAdminGate = { actor: SuperAdminActor } | { error: NextResponse };

/** Platform super-admin gate for /api/v1/super-admin/*; role comes from the session. */
export async function requireSuperAdminActor(
  request: NextRequest,
  requestId: string,
  options: { mutation: boolean }
): Promise<SuperAdminGate> {
  if (options.mutation && !isSameOriginRequest(request)) {
    return { error: jsonError("FORBIDDEN", "Cross-origin requests are not allowed", { requestId }) };
  }
  const authorized = await getAuthorizedActor(request);
  if (!authorized || authorized.actor.kind !== "super-admin") {
    return { error: jsonError("UNAUTHENTICATED", "Super-admin sign-in required", { requestId }) };
  }
  return { actor: authorized.actor };
}
