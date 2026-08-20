import { randomBytes } from "node:crypto";
import { getPool, query, queryOne, withTransaction } from "@/lib/db";
import { hashPassword } from "@/lib/passwords";
import { openSecret } from "@/lib/secret-box";
import { verifyTotpCode } from "@/lib/totp";
import { findPlatformUserByEmail, findPlatformUserById } from "@/lib/repositories/platform-users";
import { findTenantById } from "@/lib/repositories/tenants";
import { revokeSessionsForPlatformUser, revokeSessionsForTenant } from "@/lib/repositories/sessions";
import { appUrl } from "@/lib/hosts";
import { getLogger } from "@/lib/logger";
import { getMailer } from "@/lib/mailer";
import { computeRetention } from "@/lib/retention";
import { buildWelcomeEmail } from "@/lib/welcome-email";
import { getStorage } from "@/lib/storage";
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
  /** Required by the retention policy (ADR-007): the window derives from it. */
  eventStartsAt: Date;
  timezone?: string;
}

export interface ProvisionResponse {
  tenantId: string;
  slug: string;
  accessCode: string;
  /** Set only when a new owner account was created; shown once. */
  temporaryPassword?: string;
  /** False when the onboarding email could not be sent; the credentials above are then the only copy. */
  welcomeEmailSent: boolean;
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
    eventStartsAt: input.eventStartsAt,
    timezone: input.timezone,
    actorPlatformUserId: actor.platformUserId
  });

  // Onboarding email with credentials and instructions, sent the moment the
  // account exists. Best-effort: a mail failure never undoes provisioning —
  // the same credentials are shown once in the provisioning response.
  let welcomeEmailSent = true;
  try {
    await getMailer().send({
      to: input.ownerEmail,
      ...buildWelcomeEmail({
        ownerName: input.ownerDisplayName,
        ownerEmail: input.ownerEmail,
        eventName: input.eventName,
        eventDate: input.eventStartsAt,
        albumUrl: appUrl(`/a/${result.tenant.slug}`),
        adminUrl: appUrl(`/a/${result.tenant.slug}/admin`),
        accessCode: result.accessCode,
        temporaryPassword
      })
    });
  } catch (error) {
    welcomeEmailSent = false;
    getLogger().warn("welcome email failed after provisioning", {
      tenantId: result.tenant.id,
      error: error instanceof Error ? error.message : "unknown"
    });
  }

  return {
    tenantId: result.tenant.id,
    slug: result.tenant.slug,
    accessCode: result.accessCode,
    temporaryPassword,
    welcomeEmailSent
  };
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


export interface AdminAccount {
  userId: string;
  email: string;
  displayName: string;
  disabled: boolean;
  tenant: {
    id: string;
    slug: string;
    status: "draft" | "active" | "archived";
    createdAt: string;
    eventName: string | null;
    eventStartsAt: string | null;
    photoCount: number;
    memberCount: number;
    /** Past the retention window with content still present (ADR-007). */
    flagged: boolean;
    flaggedAt: string;
  } | null;
}

/** Every non-super-admin platform account, with its album's retention state. */
export async function listAdminAccounts(): Promise<AdminAccount[]> {
  const rows = await query<{
    user_id: string;
    email: string;
    display_name: string;
    disabled_at: Date | null;
    tenant_id: string | null;
    slug: string | null;
    status: "draft" | "active" | "archived" | null;
    tenant_created_at: Date | null;
    event_name: string | null;
    event_starts_at: Date | null;
    photo_count: string | null;
    member_count: string | null;
  }>(
    getPool(),
    `SELECT u.id AS user_id, u.email, u.display_name, u.disabled_at,
            t.id AS tenant_id, t.slug, t.status, t.created_at AS tenant_created_at,
            e.name AS event_name, e.starts_at AS event_starts_at,
            (SELECT count(*) FROM photos p WHERE p.tenant_id = t.id AND p.deleted_at IS NULL) AS photo_count,
            (SELECT count(*) FROM memberships m WHERE m.tenant_id = t.id AND m.disabled_at IS NULL) AS member_count
     FROM platform_users u
     LEFT JOIN tenants t ON t.owner_user_id = u.id
     LEFT JOIN events e ON e.tenant_id = t.id
     WHERE u.is_super_admin = false
     ORDER BY u.created_at DESC`
  );
  return rows.map((row) => {
    if (!row.tenant_id) {
      return {
        userId: row.user_id,
        email: row.email,
        displayName: row.display_name,
        disabled: row.disabled_at !== null,
        tenant: null
      };
    }
    const retention = computeRetention(row.event_starts_at, row.tenant_created_at!);
    const photoCount = Number(row.photo_count ?? 0);
    return {
      userId: row.user_id,
      email: row.email,
      displayName: row.display_name,
      disabled: row.disabled_at !== null,
      tenant: {
        id: row.tenant_id,
        slug: row.slug!,
        status: row.status!,
        createdAt: row.tenant_created_at!.toISOString(),
        eventName: row.event_name,
        eventStartsAt: row.event_starts_at ? row.event_starts_at.toISOString() : null,
        photoCount,
        memberCount: Number(row.member_count ?? 0),
        flagged: retention.flagged && photoCount > 0,
        flaggedAt: retention.flaggedAt.toISOString()
      }
    };
  });
}

export type PurgeResult =
  | { outcome: "purged"; deletedPhotos: number; deletedObjects: number }
  | { outcome: "step-up-failed" }
  | { outcome: "not-found" };

/**
 * Blank-slate album deletion (ADR-007): permanently removes the album's
 * content — photo objects and exports in storage, then photos, invitations,
 * exports, and every non-owner membership — and revokes all tenant sessions.
 * The tenant, its slug, the event row, and the owner account survive; the
 * event date is cleared so a fresh retention window must be set before
 * uploads reopen. Storage deletion happens before the DB transaction so a
 * storage failure can never leave orphaned objects unaccounted for.
 */
export async function purgeAlbumContentAsSuperAdmin(
  actor: SuperAdminActor,
  tenantId: string,
  confirmation: { totpCode: string }
): Promise<PurgeResult> {
  const db = getPool();
  const user = await findPlatformUserById(db, actor.platformUserId);
  if (!user?.is_super_admin || !user.mfa_enabled_at || !user.mfa_totp_secret_encrypted) {
    return { outcome: "step-up-failed" };
  }
  const secret = openSecret(user.mfa_totp_secret_encrypted, "totp");
  if (!verifyTotpCode(secret, confirmation.totpCode)) return { outcome: "step-up-failed" };

  const tenant = await findTenantById(db, tenantId);
  if (!tenant) return { outcome: "not-found" };

  const keys = await query<{ object_key: string }>(
    db,
    `SELECT object_key FROM photos WHERE tenant_id = $1
     UNION
     SELECT object_key FROM exports WHERE tenant_id = $1 AND object_key IS NOT NULL`,
    [tenantId]
  );
  const storage = getStorage();
  let deletedObjects = 0;
  for (const { object_key } of keys) {
    try {
      await storage.deleteObject(object_key);
      deletedObjects += 1;
    } catch {
      // Missing objects are fine; the DB rows go regardless.
    }
  }

  return withTransaction(async (client) => {
    await query(client, `UPDATE events SET cover_photo_id = NULL, starts_at = NULL, updated_at = now() WHERE tenant_id = $1`, [tenantId]);
    await query(client, `DELETE FROM exports WHERE tenant_id = $1`, [tenantId]);
    await query(client, `DELETE FROM invitations WHERE tenant_id = $1`, [tenantId]);
    const photos = await queryOne<{ count: number }>(
      client,
      `WITH deleted AS (DELETE FROM photos WHERE tenant_id = $1 RETURNING id)
       SELECT count(*)::int AS count FROM deleted`,
      [tenantId]
    );
    await query(client, `DELETE FROM jobs WHERE tenant_id = $1`, [tenantId]);
    await query(client, `DELETE FROM memberships WHERE tenant_id = $1 AND platform_user_id IS DISTINCT FROM $2`, [
      tenantId,
      tenant.owner_user_id
    ]);
    const revokedSessions = await revokeSessionsForTenant(client, tenantId);
    await writeAuditEvent(client, {
      tenantId,
      actorPlatformUserId: actor.platformUserId,
      action: "album.purge",
      targetType: "tenant",
      targetId: tenantId,
      metadata: { deletedPhotos: photos?.count ?? 0, deletedObjects, revokedSessions }
    });
    return { outcome: "purged" as const, deletedPhotos: photos?.count ?? 0, deletedObjects };
  });
}


export type AccountDeleteResult =
  | { outcome: "deleted"; freedSlug: string | null }
  | { outcome: "step-up-failed" }
  | { outcome: "confirm-mismatch" }
  | { outcome: "forbidden-target" }
  | { outcome: "content-present" }
  | { outcome: "not-found" };

/**
 * Full teardown for mis-provisioned or test accounts (extends ADR-007): after
 * the album has been emptied, the super-admin can remove every remaining
 * trace — the tenant row (cascading the event, owner membership, and any
 * residue) and the platform account itself. The slug becomes available for
 * future provisioning. Requires the exact account email retyped plus a fresh
 * TOTP code; refuses super-admin targets and albums that still hold content
 * (Delete album comes first). Audit rows survive with actor/tenant anonymized
 * by the schema's SET NULL rules, plus one account.delete event naming what
 * was removed.
 */
export async function deleteAdminAccountAsSuperAdmin(
  actor: SuperAdminActor,
  userId: string,
  confirmation: { confirmEmail: string; totpCode: string }
): Promise<AccountDeleteResult> {
  const db = getPool();
  const superAdmin = await findPlatformUserById(db, actor.platformUserId);
  if (!superAdmin?.is_super_admin || !superAdmin.mfa_enabled_at || !superAdmin.mfa_totp_secret_encrypted) {
    return { outcome: "step-up-failed" };
  }
  const secret = openSecret(superAdmin.mfa_totp_secret_encrypted, "totp");
  if (!verifyTotpCode(secret, confirmation.totpCode)) return { outcome: "step-up-failed" };

  const target = await findPlatformUserById(db, userId);
  if (!target) return { outcome: "not-found" };
  if (target.is_super_admin || target.id === actor.platformUserId) return { outcome: "forbidden-target" };
  if (confirmation.confirmEmail.trim().toLowerCase() !== target.email.toLowerCase()) {
    return { outcome: "confirm-mismatch" };
  }

  const tenant = await queryOne<{ id: string; slug: string }>(
    db,
    `SELECT id, slug FROM tenants WHERE owner_user_id = $1`,
    [target.id]
  );

  if (tenant) {
    const content = await queryOne<{ photos: number; extra_members: number }>(
      db,
      `SELECT
         (SELECT count(*)::int FROM photos WHERE tenant_id = $1) AS photos,
         (SELECT count(*)::int FROM memberships WHERE tenant_id = $1 AND platform_user_id IS DISTINCT FROM $2) AS extra_members`,
      [tenant.id, target.id]
    );
    if ((content?.photos ?? 0) > 0 || (content?.extra_members ?? 0) > 0) {
      return { outcome: "content-present" };
    }
    // Belt and braces: the album should already be empty, but sweep any
    // stray storage objects before their DB references disappear.
    const keys = await query<{ object_key: string }>(
      db,
      `SELECT object_key FROM photos WHERE tenant_id = $1
       UNION
       SELECT object_key FROM exports WHERE tenant_id = $1 AND object_key IS NOT NULL`,
      [tenant.id]
    );
    const storage = getStorage();
    for (const { object_key } of keys) {
      try {
        await storage.deleteObject(object_key);
      } catch {
        // Already gone is fine.
      }
    }
  }

  return withTransaction(async (client) => {
    if (tenant) await query(client, `DELETE FROM tenants WHERE id = $1`, [tenant.id]);
    await query(client, `DELETE FROM platform_users WHERE id = $1`, [target.id]);
    await writeAuditEvent(client, {
      actorPlatformUserId: actor.platformUserId,
      action: "account.delete",
      targetType: "platform_user",
      targetId: target.id,
      metadata: { email: target.email, freedSlug: tenant?.slug ?? null }
    });
    return { outcome: "deleted" as const, freedSlug: tenant?.slug ?? null };
  });
}
