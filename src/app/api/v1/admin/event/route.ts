import type { NextRequest } from "next/server";
import { z } from "zod";
import { requireAdminActor } from "@/lib/admin-route";
import { jsonError, jsonSuccess, jsonValidationError, newRequestId } from "@/lib/http";
import { getEventSettings, updateEventSettings } from "@/services/event-admin";

const patchSchema = z
  .object({
    name: z.string().min(1).max(200).optional(),
    timezone: z.string().min(1).max(64).optional()
  })
  .refine((value) => value.name !== undefined || value.timezone !== undefined, {
    message: "Nothing to update"
  });

export async function GET(request: NextRequest) {
  const requestId = newRequestId();
  const gate = await requireAdminActor(request, requestId, { mutation: false });
  if ("error" in gate) return gate.error;

  const settings = await getEventSettings(gate.actor);
  if (!settings) return jsonError("NOT_FOUND", "Event not found", { requestId });
  return jsonSuccess(settings, requestId);
}

export async function PATCH(request: NextRequest) {
  const requestId = newRequestId();
  const gate = await requireAdminActor(request, requestId, { mutation: true });
  if ("error" in gate) return gate.error;

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return jsonValidationError(parsed.error, requestId);

  const settings = await updateEventSettings(gate.actor, parsed.data);
  if (!settings) return jsonError("NOT_FOUND", "Event not found", { requestId });
  return jsonSuccess(settings, requestId);
}
