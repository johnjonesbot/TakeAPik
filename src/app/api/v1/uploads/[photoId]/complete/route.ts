import type { NextRequest } from "next/server";
import { z } from "zod";
import { jsonError, jsonSuccess, jsonValidationError, newRequestId } from "@/lib/http";
import { getAuthorizedActor, isSameOriginRequest } from "@/lib/request-context";
import { completeUpload } from "@/services/uploads";

const bodySchema = z.object({
  description: z.string().max(1000).optional()
});

export async function POST(request: NextRequest, context: { params: Promise<{ photoId: string }> }) {
  const requestId = newRequestId();
  if (!isSameOriginRequest(request)) {
    return jsonError("FORBIDDEN", "Cross-origin requests are not allowed", { requestId });
  }
  const authorized = await getAuthorizedActor(request);
  if (!authorized || authorized.actor.kind === "super-admin") {
    return jsonError("UNAUTHENTICATED", "Sign in to upload", { requestId });
  }

  const { photoId } = await context.params;
  if (!z.uuid().safeParse(photoId).success) {
    return jsonError("NOT_FOUND", "Photo not found", { requestId });
  }
  const parsed = bodySchema.safeParse((await request.json().catch(() => null)) ?? {});
  if (!parsed.success) return jsonValidationError(parsed.error, requestId);

  const result = await completeUpload({
    tenantId: authorized.actor.tenantId,
    membershipId: authorized.actor.membershipId,
    photoId,
    description: parsed.data.description
  });

  if (result.outcome === "not-found") return jsonError("NOT_FOUND", "Photo not found", { requestId });
  if (result.outcome === "rejected") {
    return jsonError("UPLOAD_INVALID", "The uploaded file failed verification", {
      requestId,
      fields: { file: result.reason }
    });
  }
  return jsonSuccess({ photoId: result.photo.id, status: result.photo.status }, requestId);
}
