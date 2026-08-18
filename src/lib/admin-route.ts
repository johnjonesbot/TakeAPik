import type { NextRequest, NextResponse } from "next/server";
import { jsonError } from "@/lib/http";
import { getAuthorizedActor, isSameOriginRequest } from "@/lib/request-context";
import type { AdminActor } from "@/services/event-admin";

export type AdminGate = { actor: AdminActor; tenantSlug: string } | { error: NextResponse };

/** Event-admin gate for /api/v1/admin/*: tenant host + admin actor (+ origin check for mutations). */
export async function requireAdminActor(request: NextRequest, requestId: string, options: { mutation: boolean }): Promise<AdminGate> {
  if (options.mutation && !isSameOriginRequest(request)) {
    return { error: jsonError("FORBIDDEN", "Cross-origin requests are not allowed", { requestId }) };
  }
  const authorized = await getAuthorizedActor(request);
  if (!authorized || authorized.actor.kind !== "admin" || authorized.tenant.kind !== "tenant") {
    return { error: jsonError("UNAUTHENTICATED", "Admin sign-in required", { requestId }) };
  }
  return { actor: authorized.actor, tenantSlug: authorized.tenant.context.slug };
}
