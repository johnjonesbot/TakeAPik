import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdminActor } from "@/lib/admin-route";
import { jsonError, jsonSuccess, jsonValidationError, newRequestId } from "@/lib/http";
import { clearCoverPhoto, setCoverPhoto } from "@/services/event-admin";

const bodySchema = z.object({ photoId: z.uuid() });

export async function PUT(request: NextRequest) {
  const requestId = newRequestId();
  const gate = await requireAdminActor(request, requestId, { mutation: true });
  if ("error" in gate) return gate.error;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonValidationError(parsed.error, requestId);

  const result = await setCoverPhoto(gate.actor, parsed.data.photoId);
  if (result === "not-found") return jsonError("NOT_FOUND", "Photo not found", { requestId });
  return jsonSuccess({ coverPhotoId: parsed.data.photoId }, requestId);
}

export async function DELETE(request: NextRequest) {
  const requestId = newRequestId();
  const gate = await requireAdminActor(request, requestId, { mutation: true });
  if ("error" in gate) return gate.error;
  await clearCoverPhoto(gate.actor);
  return jsonSuccess({ coverPhotoId: null }, requestId);
}
