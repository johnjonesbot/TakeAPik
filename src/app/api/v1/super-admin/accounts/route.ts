import type { NextRequest } from "next/server";
import { jsonSuccess, newRequestId } from "@/lib/http";
import { requireSuperAdminActor } from "@/lib/super-admin-route";
import { listAdminAccounts } from "@/services/platform-admin";

export async function GET(request: NextRequest) {
  const requestId = newRequestId();
  const gate = await requireSuperAdminActor(request, requestId, { mutation: false });
  if ("error" in gate) return gate.error;
  return jsonSuccess({ accounts: await listAdminAccounts() }, requestId);
}
