import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdminActor } from "@/lib/admin-route";
import { jsonError, jsonSuccess, jsonValidationError, newRequestId } from "@/lib/http";
import { sendInvitations } from "@/services/invitations";

const bodySchema = z.object({
  membershipIds: z.array(z.uuid()).max(500).optional(),
  idempotencyKey: z.string().min(8).max(128)
});

export async function POST(request: NextRequest) {
  const requestId = newRequestId();
  const gate = await requireAdminActor(request, requestId, { mutation: true });
  if ("error" in gate) return gate.error;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonValidationError(parsed.error, requestId);

  const result = await sendInvitations(gate.actor, gate.tenantSlug, parsed.data);
  if (result.outcome === "rate-limited") {
    return jsonError("RATE_LIMITED", "Invitation limit reached for this hour", { requestId });
  }
  if (result.outcome === "event-missing") return jsonError("NOT_FOUND", "Event not found", { requestId });
  return jsonSuccess({ invitations: result.invitations, replayed: result.replayed }, requestId);
}
