import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdminActor } from "@/lib/admin-route";
import { jsonError, jsonSuccess, jsonValidationError, newRequestId } from "@/lib/http";
import { confirmMfaEnrollment, startMfaEnrollment } from "@/services/auth-admin";

const bodySchema = z.union([
  z.object({ action: z.literal("start") }),
  z.object({ action: z.literal("confirm"), code: z.string().regex(/^\d{6}$/) })
]);

/** MFA enrollment: "start" returns the otpauth URI once; "confirm" activates it. */
export async function POST(request: NextRequest) {
  const requestId = newRequestId();
  const gate = await requireAdminActor(request, requestId, { mutation: true });
  if ("error" in gate) return gate.error;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonValidationError(parsed.error, requestId);

  if (parsed.data.action === "start") {
    const enrollment = await startMfaEnrollment(gate.actor.platformUserId);
    if (!enrollment) return jsonError("NOT_FOUND", "Account not found", { requestId });
    return jsonSuccess({ enrollmentUri: enrollment.enrollmentUri, secret: enrollment.secret }, requestId);
  }

  const confirmed = await confirmMfaEnrollment(gate.actor.platformUserId, parsed.data.code);
  if (!confirmed) return jsonError("FORBIDDEN", "That code didn't match; try again", { requestId });
  return jsonSuccess({ mfaEnabled: true }, requestId);
}
