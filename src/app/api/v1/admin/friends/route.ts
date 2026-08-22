import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdminActor } from "@/lib/admin-route";
import { jsonError, jsonSuccess, jsonValidationError, newRequestId } from "@/lib/http";
import { createFriendAndInvite, importFriends, listFriends } from "@/services/friends";

const importRowSchema = z.object({
  email: z.string().email().max(320),
  name: z.string().min(1).max(120)
});

const guestSchema = z
  .object({
    name: z.string().min(1).max(120),
    email: z.string().email().max(320).optional().or(z.literal("")),
    phone: z.string().max(32).optional().or(z.literal(""))
  })
  .refine((v) => (v.email && v.email.length > 0) || (v.phone && v.phone.length > 0), {
    message: "Add an email or a phone number",
    path: ["email"]
  });

const bodySchema = z.union([guestSchema, z.object({ import: z.array(importRowSchema).min(1).max(500) })]);

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

  const result = await createFriendAndInvite(gate.actor, {
    name: parsed.data.name,
    email: parsed.data.email || undefined,
    phone: parsed.data.phone || undefined
  });
  if (result.outcome === "duplicate-email") {
    return jsonError("CONFLICT", "That email or phone is already on the list", { requestId });
  }
  if (result.outcome === "invalid-contact") {
    return jsonError("VALIDATION_ERROR", "Add a valid email or phone number", {
      requestId,
      fields: { email: "Add an email or phone" }
    });
  }
  return jsonSuccess({ friend: result.friend }, requestId);
}
