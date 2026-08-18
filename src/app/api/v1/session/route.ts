import type { NextRequest } from "next/server";
import { jsonError, jsonSuccess, newRequestId } from "@/lib/http";
import { getAuthorizedActor } from "@/lib/request-context";

/** Minimal actor and tenant context for the client shell; no PII. */
export async function GET(request: NextRequest) {
  const requestId = newRequestId();
  const authorized = await getAuthorizedActor(request);
  if (!authorized) return jsonError("UNAUTHENTICATED", "Sign in to continue", { requestId });

  const { actor, tenant } = authorized;
  return jsonSuccess(
    {
      actor:
        actor.kind === "super-admin"
          ? { kind: actor.kind }
          : { kind: actor.kind, membershipId: actor.membershipId },
      tenant:
        tenant.kind === "tenant"
          ? { slug: tenant.context.slug, displayName: tenant.context.displayName }
          : null
    },
    requestId
  );
}
