import type { NextRequest } from "next/server";
import { z } from "zod";
import { jsonError, jsonSuccess, jsonValidationError, newRequestId } from "@/lib/http";
import { requireSuperAdminActor } from "@/lib/super-admin-route";
import { archiveTenantAsSuperAdmin } from "@/services/platform-admin";

const bodySchema = z.object({
  confirmSlug: z.string().min(1).max(64),
  totpCode: z.string().regex(/^\d{6}$/)
});

export async function POST(request: NextRequest, context: { params: Promise<{ tenantId: string }> }) {
  const requestId = newRequestId();
  const gate = await requireSuperAdminActor(request, requestId, { mutation: true });
  if ("error" in gate) return gate.error;

  const { tenantId } = await context.params;
  if (!z.uuid().safeParse(tenantId).success) return jsonError("NOT_FOUND", "Tenant not found", { requestId });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonValidationError(parsed.error, requestId);

  const result = await archiveTenantAsSuperAdmin(gate.actor, tenantId, parsed.data);
  if (result === "step-up-failed") return jsonError("FORBIDDEN", "MFA confirmation failed", { requestId });
  if (result === "confirm-mismatch") {
    return jsonError("VALIDATION_ERROR", "Type the album's exact address name to confirm", {
      requestId,
      fields: { confirmSlug: "Doesn't match" }
    });
  }
  if (result === "not-found") return jsonError("NOT_FOUND", "Tenant not found", { requestId });
  return jsonSuccess({ archived: true }, requestId);
}
