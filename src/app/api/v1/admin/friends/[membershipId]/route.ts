import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdminActor } from "@/lib/admin-route";
import { jsonError, jsonSuccess, jsonValidationError, newRequestId } from "@/lib/http";
import { disableFriend, renameFriend } from "@/services/friends";

const patchSchema = z.object({ name: z.string().min(1).max(120) });

type RouteContext = { params: Promise<{ membershipId: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  const requestId = newRequestId();
  const gate = await requireAdminActor(request, requestId, { mutation: true });
  if ("error" in gate) return gate.error;

  const { membershipId } = await context.params;
  if (!z.uuid().safeParse(membershipId).success) return jsonError("NOT_FOUND", "Friend not found", { requestId });
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonValidationError(parsed.error, requestId);

  const friend = await renameFriend(gate.actor, membershipId, parsed.data.name);
  if (!friend) return jsonError("NOT_FOUND", "Friend not found", { requestId });
  return jsonSuccess({ friend }, requestId);
}

/** DELETE disables the membership (and revokes sessions); it never hard-deletes. */
export async function DELETE(request: NextRequest, context: RouteContext) {
  const requestId = newRequestId();
  const gate = await requireAdminActor(request, requestId, { mutation: true });
  if ("error" in gate) return gate.error;

  const { membershipId } = await context.params;
  if (!z.uuid().safeParse(membershipId).success) return jsonError("NOT_FOUND", "Friend not found", { requestId });

  const result = await disableFriend(gate.actor, membershipId);
  if (result === "cannot-disable-self") {
    return jsonError("CONFLICT", "You can't disable your own admin account", { requestId });
  }
  if (result === "not-found") return jsonError("NOT_FOUND", "Friend not found", { requestId });
  return jsonSuccess({ disabled: true }, requestId);
}
