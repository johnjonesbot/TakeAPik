import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdminActor } from "@/lib/admin-route";
import { jsonError, jsonSuccess, newRequestId } from "@/lib/http";
import { getExport } from "@/services/exports";

export async function GET(request: NextRequest, context: { params: Promise<{ exportId: string }> }) {
  const requestId = newRequestId();
  const gate = await requireAdminActor(request, requestId, { mutation: false });
  if ("error" in gate) return gate.error;

  const { exportId } = await context.params;
  if (!z.uuid().safeParse(exportId).success) return jsonError("NOT_FOUND", "Export not found", { requestId });

  const view = await getExport(gate.actor, exportId);
  if (!view) return jsonError("NOT_FOUND", "Export not found", { requestId });
  return jsonSuccess({ export: view }, requestId);
}
