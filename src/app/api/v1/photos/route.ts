import type { NextRequest } from "next/server";
import { jsonError, jsonSuccess, newRequestId } from "@/lib/http";
import { getAuthorizedActor } from "@/lib/request-context";
import { getPhotoFeed } from "@/services/photos";

export async function GET(request: NextRequest) {
  const requestId = newRequestId();
  const authorized = await getAuthorizedActor(request);
  if (!authorized || authorized.actor.kind === "super-admin") {
    return jsonError("UNAUTHENTICATED", "Sign in to view the album", { requestId });
  }

  const limitParam = request.nextUrl.searchParams.get("limit");
  const feed = await getPhotoFeed({
    tenantId: authorized.actor.tenantId,
    viewerMembershipId: authorized.actor.membershipId,
    cursor: request.nextUrl.searchParams.get("cursor") ?? undefined,
    limit: limitParam ? Number(limitParam) : undefined,
    order: request.nextUrl.searchParams.get("order") === "asc" ? "asc" : "desc"
  });
  if ("invalidCursor" in feed) {
    return jsonError("VALIDATION_ERROR", "Refresh and try again", { requestId, fields: { cursor: "Invalid cursor" } });
  }
  return jsonSuccess(feed, requestId);
}
