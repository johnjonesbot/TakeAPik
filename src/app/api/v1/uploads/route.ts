import type { NextRequest } from "next/server";
import { z } from "zod";
import { jsonError, jsonSuccess, jsonValidationError, newRequestId } from "@/lib/http";
import { getAuthorizedActor, isSameOriginRequest } from "@/lib/request-context";
import { createUploadIntent } from "@/services/uploads";

const bodySchema = z.object({
  filename: z.string().min(1).max(255),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  byteSize: z.number().int().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  checksumSha256: z.string().regex(/^[0-9a-f]{64}$/)
});

export async function POST(request: NextRequest) {
  const requestId = newRequestId();
  if (!isSameOriginRequest(request)) {
    return jsonError("FORBIDDEN", "Cross-origin requests are not allowed", { requestId });
  }
  const authorized = await getAuthorizedActor(request);
  if (!authorized || authorized.actor.kind === "super-admin") {
    return jsonError("UNAUTHENTICATED", "Sign in to upload", { requestId });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonValidationError(parsed.error, requestId);

  const result = await createUploadIntent({
    tenantId: authorized.actor.tenantId,
    membershipId: authorized.actor.membershipId,
    ...parsed.data
  });

  if (result.outcome === "rate-limited") {
    return jsonError("RATE_LIMITED", "Too many uploads at once; wait a moment", { requestId });
  }
  if (result.outcome === "invalid") {
    return jsonError("UPLOAD_INVALID", "This photo can't be uploaded", {
      requestId,
      fields: { file: result.reason }
    });
  }
  return jsonSuccess(
    {
      photoId: result.photo.id,
      uploadUrl: result.uploadUrl,
      expiresInSeconds: result.expiresInSeconds
    },
    requestId
  );
}
