import { getPool, queryOne, withTransaction } from "@/lib/db";
import { generateAccessCode, hashAccessCode } from "@/lib/access-code";
import { verifyPassword } from "@/lib/passwords";
import { openSecret, sealSecret } from "@/lib/secret-box";
import { findEventByTenant, rotateAccessCode } from "@/lib/repositories/events";
import { findTenantById } from "@/lib/repositories/tenants";
import { computeRetention, type Retention } from "@/lib/retention";
import { findPlatformUserById } from "@/lib/repositories/platform-users";
import { revokeFriendSessionsForTenant } from "@/lib/repositories/sessions";
import { findPhotoById } from "@/lib/repositories/photos";
import { getStorage } from "@/lib/storage";
import type { EventRow } from "@/lib/repositories/types";
import { writeAuditEvent } from "@/services/audit";
import type { Actor } from "@/services/sessions";

export type AdminActor = Actor & { kind: "admin" };

export interface EventSettings {
  name: string;
  timezone: string;
  /** Event date (required by policy); null on legacy or freshly purged albums until the admin sets it. */
  startsAt: string | null;
  /** Retention policy state (ADR-007) for showing the window and flag. */
  retention: {
    uploadsOpenAt: string | null;
    flaggedAt: string;
    uploadState: Retention["uploadState"];
    flagged: boolean;
  };
  /** The current guest access code (ADR-006), decrypted only for the event admin; null for rows predating visibility. */
  accessCode: string | null;
  accessCodeLastChangedAt: string;
  coverPhotoId: string | null;
  /** Signed URL for the current cover photo, or null when none is set. */
  coverPhotoUrl: string | null;
}

function currentAccessCode(event: EventRow): string | null {
  if (!event.access_code_encrypted) return null;
  try {
    return openSecret(event.access_code_encrypted, "access-code");
  } catch {
    return null;
  }
}

function toSettings(event: EventRow, tenantCreatedAt: Date): EventSettings {
  const retention = computeRetention(event.starts_at, tenantCreatedAt);
  return {
    name: event.name,
    timezone: event.timezone,
    startsAt: event.starts_at ? event.starts_at.toISOString() : null,
    retention: {
      uploadsOpenAt: retention.uploadsOpenAt ? retention.uploadsOpenAt.toISOString() : null,
      flaggedAt: retention.flaggedAt.toISOString(),
      uploadState: retention.uploadState,
      flagged: retention.flagged
    },
    accessCode: currentAccessCode(event),
    accessCodeLastChangedAt: event.access_code_last_changed_at.toISOString(),
    coverPhotoId: event.cover_photo_id,
    coverPhotoUrl: null
  };
}

export async function getEventSettings(actor: AdminActor): Promise<EventSettings | null> {
  const [event, tenant] = await Promise.all([
    findEventByTenant(getPool(), actor.tenantId),
    findTenantById(getPool(), actor.tenantId)
  ]);
  if (!event || !tenant) return null;
  const settings = toSettings(event, tenant.created_at);
  if (event.cover_photo_id) {
    const cover = await findPhotoById(getPool(), actor.tenantId, event.cover_photo_id);
    if (cover && cover.status === "ready" && !cover.deleted_at) {
      try {
        settings.coverPhotoUrl = await getStorage().createSignedGetUrl(cover.object_key, 10 * 60);
      } catch {
        settings.coverPhotoUrl = null;
      }
    }
  }
  return settings;
}

export async function updateEventSettings(
  actor: AdminActor,
  changes: { name?: string; timezone?: string; startsAt?: Date }
): Promise<EventSettings | null> {
  return withTransaction(async (client) => {
    const event = await queryOne<EventRow>(
      client,
      `UPDATE events SET
         name = COALESCE($2, name),
         timezone = COALESCE($3, timezone),
         starts_at = COALESCE($4, starts_at),
         updated_at = now()
       WHERE tenant_id = $1
       RETURNING *`,
      [actor.tenantId, changes.name ?? null, changes.timezone ?? null, changes.startsAt ?? null]
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
    const tenant = await findTenantById(client, actor.tenantId);
    return tenant ? toSettings(event, tenant.created_at) : null;
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
  const accessCodeEncrypted = sealSecret(accessCode, "access-code");

  return withTransaction(async (client) => {
    const event = await rotateAccessCode(client, actor.tenantId, accessCodeHash, accessCodeEncrypted);
    if (!event) return { outcome: "not-found" as const };
    // Rotation is meant to lock out anyone with only the old code, so existing
    // guest sessions end now; the admin's own session is preserved.
    const revokedGuests = await revokeFriendSessionsForTenant(client, actor.tenantId);
    await writeAuditEvent(client, {
      tenantId: actor.tenantId,
      actorPlatformUserId: actor.platformUserId,
      actorMembershipId: actor.membershipId,
      action: "event.access_code.rotate",
      targetType: "event",
      targetId: event.id,
      metadata: { revokedGuestSessions: revokedGuests }
    });
    return { outcome: "rotated" as const, accessCode };
  });
}

export type SetCoverResult = "set" | "not-found";

/** Remove the album cover so the plain dark background returns. */
export async function clearCoverPhoto(actor: AdminActor): Promise<void> {
  await withTransaction(async (client) => {
    await queryOne<EventRow>(
      client,
      `UPDATE events SET cover_photo_id = NULL, updated_at = now() WHERE tenant_id = $1 RETURNING *`,
      [actor.tenantId]
    );
    await writeAuditEvent(client, {
      tenantId: actor.tenantId,
      actorPlatformUserId: actor.platformUserId,
      actorMembershipId: actor.membershipId,
      action: "member.update",
      targetType: "event",
      targetId: actor.tenantId,
      metadata: { change: "cover-cleared" }
    });
  });
}

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
