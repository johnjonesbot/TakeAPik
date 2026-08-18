import { getEnv } from "@/lib/env";
import { getPool, type Queryable } from "@/lib/db";
import { generateOpaqueToken, hashToken } from "@/lib/tokens";
import {
  createSessionRow,
  findActiveSessionByTokenHash,
  revokeSessionById,
  type SessionRow
} from "@/lib/repositories/sessions";
import { findMembershipById } from "@/lib/repositories/memberships";
import { findPlatformUserById } from "@/lib/repositories/platform-users";

export type Actor =
  | { kind: "friend"; tenantId: string; membershipId: string; sessionId: string }
  | { kind: "admin"; tenantId: string; membershipId: string; platformUserId: string; sessionId: string }
  | { kind: "super-admin"; platformUserId: string; sessionId: string };

export interface IssuedSession {
  /** Plaintext token for the cookie; never stored or logged. */
  token: string;
  session: SessionRow;
}

export interface IssueSessionInput {
  tenantId?: string;
  membershipId?: string;
  platformUserId?: string;
  ipHash?: string;
  userAgentHash?: string;
}

export async function issueSession(db: Queryable, input: IssueSessionInput): Promise<IssuedSession> {
  const token = generateOpaqueToken();
  const ttlMs = getEnv().SESSION_TTL_HOURS * 60 * 60 * 1000;
  const session = await createSessionRow(db, {
    ...input,
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + ttlMs)
  });
  return { token, session };
}

/**
 * Resolve a cookie token to an Actor, revalidating the underlying account and
 * membership on every request so disable/archive take effect immediately.
 */
export async function resolveActorFromToken(token: string): Promise<Actor | null> {
  if (!token) return null;
  const db = getPool();
  const session = await findActiveSessionByTokenHash(db, hashToken(token));
  if (!session) return null;

  if (session.platform_user_id && !session.tenant_id) {
    const user = await findPlatformUserById(db, session.platform_user_id);
    if (!user || user.disabled_at || !user.is_super_admin) return null;
    return { kind: "super-admin", platformUserId: user.id, sessionId: session.id };
  }

  if (!session.tenant_id || !session.membership_id) return null;
  const membership = await findMembershipById(db, session.tenant_id, session.membership_id);
  if (!membership || membership.disabled_at) return null;

  if (membership.role === "admin" && session.platform_user_id) {
    const user = await findPlatformUserById(db, session.platform_user_id);
    if (!user || user.disabled_at) return null;
    return {
      kind: "admin",
      tenantId: session.tenant_id,
      membershipId: membership.id,
      platformUserId: user.id,
      sessionId: session.id
    };
  }

  return { kind: "friend", tenantId: session.tenant_id, membershipId: membership.id, sessionId: session.id };
}

export async function revokeSessionByToken(token: string): Promise<void> {
  const session = await findActiveSessionByTokenHash(getPool(), hashToken(token));
  if (session) await revokeSessionById(getPool(), session.id);
}
