import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdminActor } from "@/lib/admin-route";
import { jsonError, jsonSuccess, jsonValidationError, newRequestId } from "@/lib/http";
import { rotateEventAccessCode } from "@/services/event-admin";

const bodySchema = z.object({
  currentPassword: z.string().min(1).max(1024)
});

/** Step-up: rotation requires the admin's password in the same request. */
export async function POST(request: NextRequest) {
  const requestId = newRequestId();
  const gate = await requireAdminActor(request, requestId, { mutation: true });
  if ("error" in gate) return gate.error;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonValidationError(parsed.error, requestId);

  const result = await rotateEventAccessCode(gate.actor, parsed.data.currentPassword);
  if (result.outcome === "step-up-failed") {
    return jsonError("FORBIDDEN", "Password confirmation failed", { requestId });
  }
  if (result.outcome === "not-found") return jsonError("NOT_FOUND", "Event not found", { requestId });
  // The plaintext code exists in this response only; the server keeps a hash.
  return jsonSuccess({ accessCode: result.accessCode }, requestId);
}
