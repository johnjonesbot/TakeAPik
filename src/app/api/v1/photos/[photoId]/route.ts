import type { NextRequest } from "next/server";
import { z } from "zod";
import { jsonError, jsonSuccess, jsonValidationError, newRequestId } from "@/lib/http";
import { getAuthorizedActor, isSameOriginRequest } from "@/lib/request-context";
import { editPhotoDescription, removePhoto } from "@/services/photos";

const patchSchema = z.object({
  description: z.string().max(1000).nullable()
});

type RouteContext = { params: Promise<{ photoId: string }> };

async function requireMemberActor(request: NextRequest, requestId: string) {
  if (!isSameOriginRequest(request)) {
    return { error: jsonError("FORBIDDEN", "Cross-origin requests are not allowed", { requestId }) };
  }
  const authorized = await getAuthorizedActor(request);
  if (!authorized || authorized.actor.kind === "super-admin") {
    return { error: jsonError("UNAUTHENTICATED", "Sign in first", { requestId }) };
  }
  return { actor: authorized.actor };
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  const requestId = newRequestId();
  const gate = await requireMemberActor(request, requestId);
  if ("error" in gate) return gate.error;

  const { photoId } = await context.params;
  if (!z.uuid().safeParse(photoId).success) return jsonError("NOT_FOUND", "Photo not found", { requestId });
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonValidationError(parsed.error, requestId);

  const updated = await editPhotoDescription(gate.actor, photoId, parsed.data.description?.trim() || null);
  // Cross-tenant, non-owner, and missing photos are indistinguishable.
  if (!updated) return jsonError("NOT_FOUND", "Photo not found", { requestId });
  return jsonSuccess({ photoId: updated.id, description: updated.description }, requestId);
}

export async function DELETE(request: NextRequest, context: RouteContext) {
  const requestId = newRequestId();
  const gate = await requireMemberActor(request, requestId);
  if ("error" in gate) return gate.error;

  const { photoId } = await context.params;
  if (!z.uuid().safeParse(photoId).success) return jsonError("NOT_FOUND", "Photo not found", { requestId });

  const deleted = await removePhoto(gate.actor, photoId);
  if (!deleted) return jsonError("NOT_FOUND", "Photo not found", { requestId });
  return jsonSuccess({ photoId: deleted.id, status: deleted.status }, requestId);
}
