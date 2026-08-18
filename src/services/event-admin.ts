import { getPool, queryOne, withTransaction } from "@/lib/db";
import { generateAccessCode, hashAccessCode } from "@/lib/access-code";
import { verifyPassword } from "@/lib/passwords";
import { findEventByTenant, rotateAccessCode } from "@/lib/repositories/events";
import { findPlatformUserById } from "@/lib/repositories/platform-users";
import type { EventRow } from "@/lib/repositories/types";
import { writeAuditEvent } from "@/services/audit";
import type { Actor } from "@/services/sessions";

export type AdminActor = Actor & { kind: "admin" };

export interface EventSettings {
  name: string;
  timezone: string;
  accessCodeLastChangedAt: string;
  coverPhotoId: string | null;
}

function toSettings(event: EventRow): EventSettings {
  return {
    name: event.name,
    timezone: event.timezone,
    accessCodeLastChangedAt: event.access_code_last_changed_at.toISOString(),
    coverPhotoId: event.cover_photo_id
  };
}

export async function getEventSettings(actor: AdminActor): Promise<EventSettings | null> {
  const event = await findEventByTenant(getPool(), actor.tenantId);
  return event ? toSettings(event) : null;
}

export async function updateEventSettings(
  actor: AdminActor,
  changes: { name?: string; timezone?: string }
): Promise<EventSettings | null> {
  return withTransaction(async (client) => {
    const event = await queryOne<EventRow>(
      client,
      `UPDATE events SET
         name = COALESCE($2, name),
         timezone = COALESCE($3, timezone),
         updated_at = now()
       WHERE tenant_id = $1
       RETURNING *`,
      [actor.tenantId, changes.name ?? null, changes.timezone ?? null]
    );
    if (!event) return null;
    await writeAuditEvent(client, {
      tenantId: actor.tenantId,
      actorPlatformUserId: actor.platformUserId,
      actorMembershipId: actor.membershipId,
      action: "member.update",
      targetType: "event",
      targetId: event.id,
      metadata: { change: "event-settings", fields: Object.keys(changes) }
    });
    return toSettings(event);
  });
}

export type RotateCodeResult =
  | { outcome: "rotated"; accessCode: string }
  | { outcome: "step-up-failed" }
  | { outcome: "not-found" };

/**
 * Access-code rotation is a step-up operation: the admin must re-present
 * their password in the same request. The new code is returned exactly once.
 */
export async function rotateEventAccessCode(actor: AdminActor, currentPassword: string): Promise<RotateCodeResult> {
  const db = getPool();
  const user = await findPlatformUserById(db, actor.platformUserId);
  if (!user || user.disabled_at) return { outcome: "step-up-failed" };
  if (!(await verifyPassword(user.password_hash, currentPassword))) return { outcome: "step-up-failed" };

  const accessCode = generateAccessCode();
  const accessCodeHash = await hashAccessCode(accessCode);

  return withTransaction(async (client) => {
    const event = await rotateAccessCode(client, actor.tenantId, accessCodeHash);
    if (!event) return { outcome: "not-found" as const };
    await writeAuditEvent(client, {
      tenantId: actor.tenantId,
      actorPlatformUserId: actor.platformUserId,
      actorMembershipId: actor.membershipId,
      action: "event.access_code.rotate",
      targetType: "event",
      targetId: event.id
    });
    return { outcome: "rotated" as const, accessCode };
  });
}

export type SetCoverResult = "set" | "not-found";

/** Only a ready, undeleted photo belonging to this tenant can be the cover. */
export async function setCoverPhoto(actor: AdminActor, photoId: string): Promise<SetCoverResult> {
  return withTransaction(async (client) => {
    const updated = await queryOne<EventRow>(
      client,
      `UPDATE events SET cover_photo_id = $2, updated_at = now()
       WHERE tenant_id = $1
         AND EXISTS (
           SELECT 1 FROM photos
           WHERE tenant_id = $1 AND id = $2 AND status = 'ready' AND deleted_at IS NULL
         )
       RETURNING *`,
      [actor.tenantId, photoId]
    );
    if (!updated) return "not-found";
    await writeAuditEvent(client, {
      tenantId: actor.tenantId,
      actorPlatformUserId: actor.platformUserId,
      actorMembershipId: actor.membershipId,
      action: "member.update",
      targetType: "event",
      targetId: updated.id,
      metadata: { change: "cover-photo", photoId }
    });
    return "set";
  });
}
