import type { NextRequest } from "next/server";
import { z } from "zod";
import { jsonError, jsonSuccess, jsonValidationError, newRequestId } from "@/lib/http";
import { requireSuperAdminActor } from "@/lib/super-admin-route";
import { changeAccountEmail, changeAdminPassword } from "@/services/auth-admin";

const bodySchema = z
  .object({
    currentPassword: z.string().min(1).max(1024),
    newPassword: z.string().min(1).max(1024).optional(),
    newEmail: z.string().max(320).optional()
  })
  .refine((body) => body.newPassword || body.newEmail, {
    message: "Provide a new password or a new email"
  });

export async function PATCH(request: NextRequest) {
  const requestId = newRequestId();
  const gate = await requireSuperAdminActor(request, requestId, { mutation: true });
  if ("error" in gate) return gate.error;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonValidationError(parsed.error, requestId);
  const { currentPassword, newPassword, newEmail } = parsed.data;

  if (newPassword) {
    const result = await changeAdminPassword({
      platformUserId: gate.actor.platformUserId,
      currentPassword,
      newPassword,
      currentSessionId: gate.actor.sessionId
    });
    if (result === "invalid-current") return jsonError("FORBIDDEN", "Current password is incorrect", { requestId });
    if (result === "weak-password") {
      return jsonError("VALIDATION_ERROR", "Choose a longer password", {
        requestId,
        fields: { newPassword: "Too short" }
      });
    }
  }

  if (newEmail) {
    const result = await changeAccountEmail({
      platformUserId: gate.actor.platformUserId,
      currentPassword,
      newEmail
    });
    if (result === "invalid-current") return jsonError("FORBIDDEN", "Current password is incorrect", { requestId });
    if (result === "invalid-email") {
      return jsonError("VALIDATION_ERROR", "That email doesn't look valid", {
        requestId,
        fields: { newEmail: "Invalid email" }
      });
    }
    if (result === "email-taken") {
      return jsonError("CONFLICT", "That email is already in use", { requestId });
    }
  }

  return jsonSuccess({ updated: true }, requestId);
}
