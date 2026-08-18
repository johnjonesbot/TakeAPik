import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdminActor } from "@/lib/admin-route";
import { jsonError, jsonSuccess, jsonValidationError, newRequestId } from "@/lib/http";
import { MIN_PASSWORD_LENGTH } from "@/lib/passwords";
import { changeAdminPassword } from "@/services/auth-admin";

const bodySchema = z.object({
  currentPassword: z.string().min(1).max(1024),
  newPassword: z.string().min(MIN_PASSWORD_LENGTH).max(1024)
});

export async function POST(request: NextRequest) {
  const requestId = newRequestId();
  const gate = await requireAdminActor(request, requestId, { mutation: true });
  if ("error" in gate) return gate.error;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonValidationError(parsed.error, requestId);

  const result = await changeAdminPassword({
    platformUserId: gate.actor.platformUserId,
    currentPassword: parsed.data.currentPassword,
    newPassword: parsed.data.newPassword,
    currentSessionId: gate.actor.sessionId
  });
  if (result === "invalid-current") return jsonError("FORBIDDEN", "Current password is incorrect", { requestId });
  if (result === "weak-password") {
    return jsonError("VALIDATION_ERROR", "Choose a longer password", {
      requestId,
      fields: { newPassword: `Use at least ${MIN_PASSWORD_LENGTH} characters` }
    });
  }
  return jsonSuccess({ changed: true }, requestId);
}
