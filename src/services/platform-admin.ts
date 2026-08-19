import { randomBytes } from "node:crypto";
import { getPool, query, queryOne, withTransaction } from "@/lib/db";
import { hashPassword } from "@/lib/passwords";
import { openSecret } from "@/lib/secret-box";
import { verifyTotpCode } from "@/lib/totp";
import { findPlatformUserByEmail, findPlatformUserById } from "@/lib/repositories/platform-users";
import { archiveTenant, findTenantById } from "@/lib/repositories/tenants";
import { revokeSessionsForPlatformUser, revokeSessionsForTenant } from "@/lib/repositories/sessions";
import { writeAuditEvent } from "@/services/audit";
import { provisionTenant } from "@/services/provisioning";
import type { Actor } from "@/services/sessions";

export type SuperAdminActor = Actor & { kind: "super-admin" };

export interface TenantSummary {
  id: string;
  slug: string;
  displayName: string;
  status: "draft" | "active" | "archived";
  ownerEmail: string;
  eventName: string | null;
  photoCount: number;
  memberCount: number;
  createdAt: string;
}

export async function listTenants(): Promise<TenantSummary[]> {
  const rows = await query<{
    id: string;
    slug: string;
    display_name: string;
    status: "draft" | "active" | "archived";
    owner_email: string;
    event_name: string | null;
    photo_count: string;
    member_count: string;
    created_at: Date;
  }>(
    getPool(),
    `SELECT t.id, t.slug, t.display_name, t.status, u.email AS owner_email, e.name AS event_name,
            (SELECT count(*) FROM photos p WHERE p.tenant_id = t.id AND p.status = 'ready' AND p.deleted_at IS NULL) AS photo_count,
            (SELECT count(*) FROM memberships m WHERE m.tenant_id = t.id AND m.disabled_at IS NULL) AS member_count,
            t.created_at
     FROM tenants t
     JOIN platform_users u ON u.id = t.owner_user_id
     LEFT JOIN events e ON e.tenant_id = t.id
     ORDER BY t.created_at DESC`
  );
  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    displayName: row.display_name,
    status: row.status,
    ownerEmail: row.owner_email,
    eventName: row.event_name,
    photoCount: Number(row.photo_count),
    memberCount: Number(row.member_count),
    createdAt: row.created_at.toISOString()
  }));
}

export interface ProvisionRequest {
  ownerEmail: string;
  ownerDisplayName: string;
  eventName: string;
  timezone?: string;
}

export interface ProvisionResponse {
  tenantId: string;
  slug: string;
  accessCode: string;
  /** Set only when a new owner account was created; shown once. */
  temporaryPassword?: string;
}

export async function provisionTenantAsSuperAdmin(
  actor: SuperAdminActor,
  input: ProvisionRequest
): Promise<ProvisionResponse> {
  const existingOwner = await findPlatformUserByEmail(getPool(), input.ownerEmail);
  const temporaryPassword = existingOwner ? undefined : randomBytes(12).toString("base64url");
  const passwordHash = await hashPassword(temporaryPassword ?? randomBytes(24).toString("base64url"));

  const result = await provisionTenant({
    ownerEmail: input.ownerEmail,
    ownerDisplayName: input.ownerDisplayName,
    ownerPasswordHash: passwordHash,
    eventName: input.eventName,
    timezone: input.timezone,
    actorPlatformUserId: actor.platformUserId
  });

  return {
    tenantId: result.tenant.id,
    slug: result.tenant.slug,
    accessCode: result.accessCode,
    temporaryPassword
  };
}

export type ArchiveResult = "archived" | "step-up-failed" | "confirm-mismatch" | "not-found";

/**
 * Archiving is destructive for guests, so it takes double confirmation: the
 * exact tenant slug retyped plus a fresh TOTP code. Sessions and outstanding
 * invitations die in the same transaction; the tenant becomes unreachable.
 */
export async function archiveTenantAsSuperAdmin(
  actor: SuperAdminActor,
  tenantId: string,
  confirmation: { confirmSlug: string; totpCode: string }
): Promise<ArchiveResult> {
  const db = getPool();
  const user = await findPlatformUserById(db, actor.platformUserId);
  if (!user?.is_super_admin || !user.mfa_enabled_at || !user.mfa_totp_secret_encrypted) return "step-up-failed";
  const secret = openSecret(user.mfa_totp_secret_encrypted, "totp");
  if (!verifyTotpCode(secret, confirmation.totpCode)) return "step-up-failed";

  const tenant = await findTenantById(db, tenantId);
  if (!tenant || tenant.status === "archived") return "not-found";
  if (tenant.slug !== confirmation.confirmSlug.trim().toLowerCase()) return "confirm-mismatch";

  return withTransaction(async (client) => {
    const archived = await archiveTenant(client, tenantId);
    if (!archived) return "not-found" as const;
    const revokedSessions = await revokeSessionsForTenant(client, tenantId);
    const revokedInvites = await queryOne<{ count: number }>(
      client,
      `WITH updated AS (
         UPDATE invitations SET status = 'revoked'
         WHERE tenant_id = $1 AND status IN ('pending', 'sent', 'delivered', 'failed')
         RETURNING id
       ) SELECT count(*)::int AS count FROM updated`,
      [tenantId]
    );
    await writeAuditEvent(client, {
      tenantId,
      actorPlatformUserId: actor.platformUserId,
      action: "tenant.archive",
      targetType: "tenant",
      targetId: tenantId,
      metadata: { revokedSessions, revokedInvites: revokedInvites?.count ?? 0 }
    });
    return "archived" as const;
  });
}

export type OwnerPasswordResetResult =
  | { outcome: "reset"; ownerEmail: string; temporaryPassword: string }
  | { outcome: "step-up-failed" }
  | { outcome: "forbidden-target" }
  | { outcome: "not-found" };

/**
 * Recovery path for an event admin who lost their password: a super-admin
 * proves a fresh TOTP code, the owner gets a new one-time temporary password
 * (returned once, stored only as a hash), and every existing session of that
 * account dies. Super-admin accounts are never resettable this way — their
 * credentials are managed outside tenant administration.
 */
export async function resetOwnerPasswordAsSuperAdmin(
  actor: SuperAdminActor,
  tenantId: string,
  confirmation: { totpCode: string }
): Promise<OwnerPasswordResetResult> {
  const db = getPool();
  const user = await findPlatformUserById(db, actor.platformUserId);
  if (!user?.is_super_admin || !user.mfa_enabled_at || !user.mfa_totp_secret_encrypted) {
    return { outcome: "step-up-failed" };
  }
  const secret = openSecret(user.mfa_totp_secret_encrypted, "totp");
  if (!verifyTotpCode(secret, confirmation.totpCode)) return { outcome: "step-up-failed" };

  const tenant = await findTenantById(db, tenantId);
  if (!tenant || tenant.status === "archived") return { outcome: "not-found" };
  const owner = await findPlatformUserById(db, tenant.owner_user_id);
  if (!owner || owner.disabled_at) return { outcome: "not-found" };
  if (owner.is_super_admin) return { outcome: "forbidden-target" };

  const temporaryPassword = randomBytes(12).toString("base64url");
  const passwordHash = await hashPassword(temporaryPassword);

  return withTransaction(async (client) => {
    await query(client, `UPDATE platform_users SET password_hash = $2, updated_at = now() WHERE id = $1`, [
      owner.id,
      passwordHash
    ]);
    const revokedSessions = await revokeSessionsForPlatformUser(client, owner.id);
    await writeAuditEvent(client, {
      tenantId,
      actorPlatformUserId: actor.platformUserId,
      action: "owner.password_reset",
      targetType: "platform_user",
      targetId: owner.id,
      metadata: { revokedSessions }
    });
    return { outcome: "reset" as const, ownerEmail: owner.email, temporaryPassword };
  });
}
