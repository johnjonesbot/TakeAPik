import type { NextRequest } from "next/server";
import { requireAdminActor } from "@/lib/admin-route";
import { jsonError, jsonSuccess, newRequestId } from "@/lib/http";
import { requestExport } from "@/services/exports";

export async function POST(request: NextRequest) {
  const requestId = newRequestId();
  const gate = await requireAdminActor(request, requestId, { mutation: true });
  if ("error" in gate) return gate.error;

  const result = await requestExport(gate.actor);
  if (result.outcome === "already-active") {
    return jsonError("CONFLICT", "An export is already in progress for this album", { requestId });
  }
  if (result.outcome === "rate-limited") {
    return jsonError("RATE_LIMITED", "Export limit reached for today", { requestId });
  }
  return jsonSuccess({ export: result.export }, requestId);
}
