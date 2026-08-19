import type { NextRequest } from "next/server";
import { z } from "zod";
import { jsonError, jsonSuccess, jsonValidationError, newRequestId } from "@/lib/http";
import { requireSuperAdminActor } from "@/lib/super-admin-route";
import { purgeAlbumContentAsSuperAdmin } from "@/services/platform-admin";

const bodySchema = z.object({
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

  const result = await purgeAlbumContentAsSuperAdmin(gate.actor, tenantId, parsed.data);
  if (result.outcome === "step-up-failed") return jsonError("FORBIDDEN", "MFA confirmation failed", { requestId });
  if (result.outcome === "not-found") return jsonError("NOT_FOUND", "Tenant not found", { requestId });
  return jsonSuccess({ deletedPhotos: result.deletedPhotos, deletedObjects: result.deletedObjects }, requestId);
}
