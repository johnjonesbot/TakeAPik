import type { NextRequest } from "next/server";
import { z } from "zod";
import { jsonError, jsonSuccess, jsonValidationError, newRequestId } from "@/lib/http";
import { requireSuperAdminActor } from "@/lib/super-admin-route";
import { deleteAdminAccountAsSuperAdmin } from "@/services/platform-admin";

const bodySchema = z.object({
  confirmEmail: z.string().min(3).max(320),
  totpCode: z.string().regex(/^\d{6}$/)
});

export async function POST(request: NextRequest, context: { params: Promise<{ userId: string }> }) {
  const requestId = newRequestId();
  const gate = await requireSuperAdminActor(request, requestId, { mutation: true });
  if ("error" in gate) return gate.error;

  const { userId } = await context.params;
  if (!z.uuid().safeParse(userId).success) return jsonError("NOT_FOUND", "Account not found", { requestId });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonValidationError(parsed.error, requestId);

  const result = await deleteAdminAccountAsSuperAdmin(gate.actor, userId, parsed.data);
  if (result.outcome === "step-up-failed") return jsonError("FORBIDDEN", "MFA confirmation failed", { requestId });
  if (result.outcome === "forbidden-target") {
    return jsonError("FORBIDDEN", "This account can't be deleted here", { requestId });
  }
  if (result.outcome === "confirm-mismatch") {
    return jsonError("VALIDATION_ERROR", "Type the account's exact email to confirm", {
      requestId,
      fields: { confirmEmail: "Doesn't match" }
    });
  }
  if (result.outcome === "content-present") {
    return jsonError("CONFLICT", "Delete the album's content first — the album still has photos or guests", {
      requestId
    });
  }
  if (result.outcome === "not-found") return jsonError("NOT_FOUND", "Account not found", { requestId });
  return jsonSuccess({ deleted: true, freedSlug: result.freedSlug }, requestId);
}
