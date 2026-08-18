import { getPool, withTransaction } from "@/lib/db";
import { normalizeEmail } from "@/lib/normalize";
import { getDummyPasswordHash, hashPassword, verifyPassword, MIN_PASSWORD_LENGTH } from "@/lib/passwords";
import { PostgresRateLimiter, type RateLimiter } from "@/lib/rate-limit";
import { openSecret, sealSecret } from "@/lib/secret-box";
import { generateTotpSecret, totpEnrollmentUri, verifyTotpCode } from "@/lib/totp";
import { findActiveMembershipByEmail } from "@/lib/repositories/memberships";
import { findPlatformUserByEmail, findPlatformUserById } from "@/lib/repositories/platform-users";
import { revokeSessionsForPlatformUser } from "@/lib/repositories/sessions";
import { queryOne } from "@/lib/db";
import { writeAuditEvent } from "@/services/audit";
import { issueSession, type IssuedSession } from "@/services/sessions";
import type { TenantContext } from "@/services/tenant-context";

const MFA_PURPOSE = "totp";

export interface AdminLoginInput {
  /** Present for tenant admin login; absent for the root super-admin portal. */
  tenant?: TenantContext;
  email: string;
  password: string;
  /** Required when the account has MFA enabled. */
  totpCode?: string;
  ipHash?: string;
  userAgentHash?: string;
}

export type AdminLoginResult =
  | { outcome: "success"; session: IssuedSession }
  | { outcome: "mfa-required" }
  | { outcome: "failure" }
  | { outcome: "rate-limited" };

/**
 * Password login for event admins (tenant portal) and super-admins (root
 * portal). Super-admin login requires enrolled MFA; tenant admins must pass
 * MFA when enrolled. Failures are uniform.
 */
export async function loginAdmin(
  input: AdminLoginInput,
  limiter: RateLimiter = new PostgresRateLimiter(getPool())
): Promise<AdminLoginResult> {
  const db = getPool();
  const email = normalizeEmail(input.email);
  const surface = input.tenant ? "admin" : "super-admin";

  const [byAccount, byIp] = await Promise.all([
    limiter.consume(`admin-login:account:${surface}:${email}`, 5, 15 * 60),
    input.ipHash ? limiter.consume(`admin-login:ip:${input.ipHash}`, 20, 60 * 60) : { allowed: true, remaining: 1 }
  ]);
  if (!byAccount.allowed || !byIp.allowed) return { outcome: "rate-limited" };

  const user = await findPlatformUserByEmail(db, email);
  const passwordHash = user && !user.disabled_at ? user.password_hash : await getDummyPasswordHash();
  const passwordOk = await verifyPassword(passwordHash, input.password);

  const fail = async (): Promise<AdminLoginResult> => {
    await writeAuditEvent(db, {
      tenantId: input.tenant?.tenantId,
      action: "auth.admin.login.failure",
      targetType: surface === "admin" ? "tenant" : "platform",
      targetId: input.tenant?.tenantId,
      metadata: { surface, reason: "invalid-credentials" },
      ipHash: input.ipHash
    });
    return { outcome: "failure" };
  };

  if (!user || user.disabled_at || !passwordOk) return fail();

  let membershipId: string | undefined;
  if (input.tenant) {
    const membership = await findActiveMembershipByEmail(db, input.tenant.tenantId, email);
    if (!membership || membership.role !== "admin" || membership.platform_user_id !== user.id) return fail();
    membershipId = membership.id;
  } else if (!user.is_super_admin) {
    return fail();
  }

  const mfaSecretSealed = user.mfa_enabled_at ? user.mfa_totp_secret_encrypted : null;
  if (!input.tenant && !mfaSecretSealed) {
    // Super-admin MFA is mandatory: an un-enrolled super-admin must enroll
    // through the bootstrap flow before the portal accepts logins.
    return fail();
  }
  if (mfaSecretSealed) {
    if (!input.totpCode) return { outcome: "mfa-required" };
    if (!verifyTotpCode(openSecret(mfaSecretSealed, MFA_PURPOSE), input.totpCode)) return fail();
  }

  const session = await issueSession(db, {
    tenantId: input.tenant?.tenantId,
    membershipId,
    platformUserId: user.id,
    ipHash: input.ipHash,
    userAgentHash: input.userAgentHash
  });

  await writeAuditEvent(db, {
    tenantId: input.tenant?.tenantId,
    actorPlatformUserId: user.id,
    actorMembershipId: membershipId,
    action: "auth.admin.login.success",
    targetType: surface === "admin" ? "tenant" : "platform",
    targetId: input.tenant?.tenantId ?? user.id,
    metadata: { surface },
    ipHash: input.ipHash
  });

  return { outcome: "success", session };
}

export interface MfaEnrollmentStart {
  secret: string;
  enrollmentUri: string;
}

/** Generate and seal a TOTP secret; MFA activates only after one valid code. */
export async function startMfaEnrollment(platformUserId: string): Promise<MfaEnrollmentStart | null> {
  const db = getPool();
  const user = await findPlatformUserById(db, platformUserId);
  if (!user || user.disabled_at) return null;
  const secret = generateTotpSecret();
  await queryOne(
    db,
    `UPDATE platform_users
     SET mfa_totp_secret_encrypted = $2, mfa_enabled_at = NULL, updated_at = now()
     WHERE id = $1 RETURNING id`,
    [platformUserId, sealSecret(secret, MFA_PURPOSE)]
  );
  return { secret, enrollmentUri: totpEnrollmentUri(secret, user.email) };
}

export async function confirmMfaEnrollment(platformUserId: string, code: string): Promise<boolean> {
  const db = getPool();
  const user = await findPlatformUserById(db, platformUserId);
  if (!user || !user.mfa_totp_secret_encrypted) return false;
  const secret = openSecret(user.mfa_totp_secret_encrypted, MFA_PURPOSE);
  if (!verifyTotpCode(secret, code)) return false;
  await queryOne(
    db,
    "UPDATE platform_users SET mfa_enabled_at = now(), updated_at = now() WHERE id = $1 RETURNING id",
    [platformUserId]
  );
  return true;
}

export interface ChangePasswordInput {
  platformUserId: string;
  currentPassword: string;
  newPassword: string;
  currentSessionId: string;
}

export type ChangePasswordResult = "success" | "invalid-current" | "weak-password";

/** Verify the current password, store the new hash, revoke every other session. */
export async function changeAdminPassword(input: ChangePasswordInput): Promise<ChangePasswordResult> {
  if (input.newPassword.length < MIN_PASSWORD_LENGTH) return "weak-password";
  return withTransaction(async (client) => {
    const user = await findPlatformUserById(client, input.platformUserId);
    if (!user || user.disabled_at) return "invalid-current";
    if (!(await verifyPassword(user.password_hash, input.currentPassword))) return "invalid-current";

    await queryOne(
      client,
      "UPDATE platform_users SET password_hash = $2, updated_at = now() WHERE id = $1 RETURNING id",
      [user.id, await hashPassword(input.newPassword)]
    );
    await revokeSessionsForPlatformUser(client, user.id, input.currentSessionId);
    await writeAuditEvent(client, {
      actorPlatformUserId: user.id,
      action: "member.update",
      targetType: "platform_user",
      targetId: user.id,
      metadata: { change: "password", revokedOtherSessions: true }
    });
    return "success";
  });
}
