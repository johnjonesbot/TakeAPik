import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdminActor } from "@/lib/admin-route";
import { jsonError, jsonSuccess, jsonValidationError, newRequestId } from "@/lib/http";
import { createFriendAndInvite, importFriends, listFriends } from "@/services/friends";

const friendSchema = z.object({
  email: z.string().email().max(320),
  name: z.string().min(1).max(120)
});

const bodySchema = z.union([friendSchema, z.object({ import: z.array(friendSchema).min(1).max(500) })]);

export async function GET(request: NextRequest) {
  const requestId = newRequestId();
  const gate = await requireAdminActor(request, requestId, { mutation: false });
  if ("error" in gate) return gate.error;
  return jsonSuccess({ friends: await listFriends(gate.actor) }, requestId);
}

export async function POST(request: NextRequest) {
  const requestId = newRequestId();
  const gate = await requireAdminActor(request, requestId, { mutation: true });
  if ("error" in gate) return gate.error;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonValidationError(parsed.error, requestId);

  if ("import" in parsed.data) {
    const result = await importFriends(gate.actor, parsed.data.import);
    return jsonSuccess(result, requestId);
  }

  const result = await createFriendAndInvite(gate.actor, parsed.data);
  if (result.outcome === "duplicate-email") {
    return jsonError("CONFLICT", "That email is already on the list", { requestId });
  }
  return jsonSuccess({ friend: result.friend }, requestId);
}
