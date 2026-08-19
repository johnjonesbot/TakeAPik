import type { NextRequest, NextResponse } from "next/server";
import { getPool } from "@/lib/db";
import { jsonError } from "@/lib/http";
import { getAuthorizedActor, isSameOriginRequest } from "@/lib/request-context";
import { findTenantById } from "@/lib/repositories/tenants";
import type { AdminActor } from "@/services/event-admin";

export type AdminGate = { actor: AdminActor; tenantSlug: string } | { error: NextResponse };

/**
 * Event-admin gate for /api/v1/admin/*. The admin's tenant comes from the
 * session (ADR-004), never the URL, so no path or host can widen access; the
 * slug is looked up only to build canonical album links.
 */
export async function requireAdminActor(request: NextRequest, requestId: string, options: { mutation: boolean }): Promise<AdminGate> {
  if (options.mutation && !isSameOriginRequest(request)) {
    return { error: jsonError("FORBIDDEN", "Cross-origin requests are not allowed", { requestId }) };
  }
  const authorized = await getAuthorizedActor(request);
  if (!authorized || authorized.actor.kind !== "admin") {
    return { error: jsonError("UNAUTHENTICATED", "Admin sign-in required", { requestId }) };
  }
  const tenant = await findTenantById(getPool(), authorized.actor.tenantId);
  if (!tenant || tenant.status !== "active") {
    return { error: jsonError("UNAUTHENTICATED", "Admin sign-in required", { requestId }) };
  }
  return { actor: authorized.actor, tenantSlug: tenant.slug };
}
