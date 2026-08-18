import type { NextRequest } from "next/server";
import { requireAdminActor } from "@/lib/admin-route";
import { jsonSuccess, newRequestId } from "@/lib/http";
import { listInvitations } from "@/services/invitations";

export async function GET(request: NextRequest) {
  const requestId = newRequestId();
  const gate = await requireAdminActor(request, requestId, { mutation: false });
  if ("error" in gate) return gate.error;
  return jsonSuccess({ invitations: await listInvitations(gate.actor) }, requestId);
}
