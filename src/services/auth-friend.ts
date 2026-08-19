import { getPool, query } from "@/lib/db";
import { hashAccessCode, verifyAccessCode } from "@/lib/access-code";
import { normalizeEmail } from "@/lib/normalize";
import { PostgresRateLimiter, type RateLimiter } from "@/lib/rate-limit";
import { findEventByTenant } from "@/lib/repositories/events";
import { findActiveMembershipByEmail } from "@/lib/repositories/memberships";
import { writeAuditEvent } from "@/services/audit";
import { issueSession, type IssuedSession } from "@/services/sessions";
import type { TenantContext } from "@/services/tenant-context";

export interface FriendLoginInput {
  tenant: TenantContext;
  email: string;
  accessCode: string;
  ipHash?: string;
  userAgentHash?: string;
}

export type FriendLoginResult =
  | { outcome: "success"; session: IssuedSession; membershipId: string; slug: string }
  | { outcome: "failure" }
  | { outcome: "rate-limited" };

let dummyCodeHashPromise: Promise<string> | undefined;
function dummyCodeHash(): Promise<string> {
  dummyCodeHashPromise ??= hashAccessCode("00000000");
  return dummyCodeHashPromise;
}

/**
 * Friend login for a known album (ADR-003): an active member email and the
 * event's eight-digit code must both match the given tenant. Failures are
 * uniform and code verification always runs, so responses do not reveal which
 * factor was wrong or which emails exist.
 */
export async function loginFriend(
  input: FriendLoginInput,
  limiter: RateLimiter = new PostgresRateLimiter(getPool())
): Promise<FriendLoginResult> {
  const db = getPool();
  const email = normalizeEmail(input.email);

  const [byIp, byEmail] = await Promise.all([
    input.ipHash ? limiter.consume(`friend-login:ip:${input.ipHash}`, 5, 15 * 60) : { allowed: true, remaining: 1 },
    limiter.consume(`friend-login:email:${input.tenant.tenantId}:${email}`, 10, 60 * 60)
  ]);
  if (!byIp.allowed || !byEmail.allowed) return { outcome: "rate-limited" };

  const [event, membership] = await Promise.all([
    findEventByTenant(db, input.tenant.tenantId),
    findActiveMembershipByEmail(db, input.tenant.tenantId, email)
  ]);

  const codeHash = event && membership ? event.access_code_hash : await dummyCodeHash();
  const codeMatches = await verifyAccessCode(codeHash, input.accessCode);

  if (!event || !membership || !codeMatches) {
    await writeAuditEvent(db, {
      tenantId: input.tenant.tenantId,
      action: "auth.friend.login.failure",
      targetType: "tenant",
      targetId: input.tenant.tenantId,
      metadata: { reason: "invalid-credentials" },
      ipHash: input.ipHash
    });
    return { outcome: "failure" };
  }

  const session = await issueSession(db, {
    tenantId: input.tenant.tenantId,
    membershipId: membership.id,
    platformUserId: membership.platform_user_id ?? undefined,
    ipHash: input.ipHash,
    userAgentHash: input.userAgentHash
  });

  await writeAuditEvent(db, {
    tenantId: input.tenant.tenantId,
    actorMembershipId: membership.id,
    action: "auth.friend.login.success",
    targetType: "membership",
    targetId: membership.id,
    ipHash: input.ipHash
  });

  return { outcome: "success", session, membershipId: membership.id, slug: input.tenant.slug };
}

export interface LocateFriendLoginInput {
  email: string;
  accessCode: string;
  ipHash?: string;
  userAgentHash?: string;
}

export type LocateFriendLoginResult =
  | { outcome: "success"; session: IssuedSession; slug: string }
  | { outcome: "failure" }
  | { outcome: "rate-limited" };

interface CandidateRow {
  tenant_id: string;
  tenant_slug: string;
  access_code_hash: string;
  membership_id: string;
  platform_user_id: string | null;
}

/**
 * Root-domain friend login (ADR-003): email plus access code identify one
 * active album, then a session is issued directly (same origin, no handoff)
 * and the caller redirects to /a/:slug. Membership email is the selective
 * factor; the random code disambiguates when one email belongs to several
 * albums.
 */
export async function locateFriendLogin(
  input: LocateFriendLoginInput,
  limiter: RateLimiter = new PostgresRateLimiter(getPool())
): Promise<LocateFriendLoginResult> {
  const db = getPool();
  const email = normalizeEmail(input.email);

  const [byIp, byEmail] = await Promise.all([
    input.ipHash ? limiter.consume(`friend-login:ip:${input.ipHash}`, 5, 15 * 60) : { allowed: true, remaining: 1 },
    limiter.consume(`friend-login:root-email:${email}`, 10, 60 * 60)
  ]);
  if (!byIp.allowed || !byEmail.allowed) return { outcome: "rate-limited" };

  const candidates = await query<CandidateRow>(
    db,
    `SELECT t.id AS tenant_id, t.slug AS tenant_slug,
            e.access_code_hash, m.id AS membership_id, m.platform_user_id
     FROM memberships m
     JOIN tenants t ON t.id = m.tenant_id AND t.status = 'active'
     JOIN events e ON e.tenant_id = t.id
     WHERE m.email = $1 AND m.disabled_at IS NULL
     LIMIT 25`,
    [email]
  );

  let matched: CandidateRow | null = null;
  for (const candidate of candidates) {
    if (await verifyAccessCode(candidate.access_code_hash, input.accessCode)) {
      matched = candidate;
      break;
    }
  }
  if (!matched) {
    await verifyAccessCode(await dummyCodeHash(), input.accessCode);
    await writeAuditEvent(db, {
      action: "auth.friend.login.failure",
      targetType: "platform",
      metadata: { surface: "root", reason: "invalid-credentials" },
      ipHash: input.ipHash
    });
    return { outcome: "failure" };
  }

  const session = await issueSession(db, {
    tenantId: matched.tenant_id,
    membershipId: matched.membership_id,
    platformUserId: matched.platform_user_id ?? undefined,
    ipHash: input.ipHash,
    userAgentHash: input.userAgentHash
  });
  await writeAuditEvent(db, {
    tenantId: matched.tenant_id,
    actorMembershipId: matched.membership_id,
    action: "auth.friend.login.success",
    targetType: "membership",
    targetId: matched.membership_id,
    metadata: { surface: "root" },
    ipHash: input.ipHash
  });
  return { outcome: "success", session, slug: matched.tenant_slug };
}
