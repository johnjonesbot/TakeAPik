import type { NextRequest } from "next/server";
import { getPool } from "@/lib/db";
import { jsonError, jsonSuccess, newRequestId } from "@/lib/http";
import { getAuthorizedActor } from "@/lib/request-context";
import { findTenantById } from "@/lib/repositories/tenants";

/** Minimal actor and tenant context for the client shell; no PII. */
export async function GET(request: NextRequest) {
  const requestId = newRequestId();
  const authorized = await getAuthorizedActor(request);
  if (!authorized) return jsonError("UNAUTHENTICATED", "Sign in to continue", { requestId });

  const { actor } = authorized;
  if (actor.kind === "super-admin") {
    return jsonSuccess({ actor: { kind: actor.kind }, tenant: null }, requestId);
  }

  const tenant = await findTenantById(getPool(), actor.tenantId);
  return jsonSuccess(
    {
      actor: { kind: actor.kind, membershipId: actor.membershipId },
      tenant: tenant ? { slug: tenant.slug, displayName: tenant.display_name } : null
    },
    requestId
  );
}
