import type { NextRequest } from "next/server";
import { z } from "zod";
import { jsonError, jsonSuccess, jsonValidationError, newRequestId } from "@/lib/http";
import { requireSuperAdminActor } from "@/lib/super-admin-route";
import { listTenants, provisionTenantAsSuperAdmin } from "@/services/platform-admin";

const provisionSchema = z.object({
  ownerEmail: z.string().email().max(320),
  ownerDisplayName: z.string().min(1).max(120),
  eventName: z.string().min(1).max(200),
  timezone: z.string().min(1).max(64).optional()
});

export async function GET(request: NextRequest) {
  const requestId = newRequestId();
  const gate = await requireSuperAdminActor(request, requestId, { mutation: false });
  if ("error" in gate) return gate.error;
  return jsonSuccess({ tenants: await listTenants() }, requestId);
}

export async function POST(request: NextRequest) {
  const requestId = newRequestId();
  const gate = await requireSuperAdminActor(request, requestId, { mutation: true });
  if ("error" in gate) return gate.error;

  const parsed = provisionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonValidationError(parsed.error, requestId);

  const owner = await provisionTenantAsSuperAdmin(gate.actor, parsed.data).catch((error: unknown) => {
    if (error instanceof Error && error.message === "Owner account is disabled") return "owner-disabled" as const;
    throw error;
  });
  if (owner === "owner-disabled") {
    return jsonError("CONFLICT", "That owner account is disabled", { requestId });
  }
  // accessCode and temporaryPassword appear in this response only.
  return jsonSuccess({ provisioned: owner }, requestId);
}
