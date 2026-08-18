import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdminActor } from "@/lib/admin-route";
import { jsonError, jsonSuccess, newRequestId } from "@/lib/http";
import { resendInvitation } from "@/services/invitations";

export async function POST(request: NextRequest, context: { params: Promise<{ invitationId: string }> }) {
  const requestId = newRequestId();
  const gate = await requireAdminActor(request, requestId, { mutation: true });
  if ("error" in gate) return gate.error;

  const { invitationId } = await context.params;
  if (!z.uuid().safeParse(invitationId).success) return jsonError("NOT_FOUND", "Invitation not found", { requestId });

  const result = await resendInvitation(gate.actor, gate.tenantSlug, invitationId);
  if (result.outcome === "attempts-exhausted") {
    return jsonError("CONFLICT", "This invitation has reached its retry limit", { requestId });
  }
  if (result.outcome === "not-found") return jsonError("NOT_FOUND", "Invitation not found", { requestId });
  return jsonSuccess({ invitation: result.invitation }, requestId);
}
