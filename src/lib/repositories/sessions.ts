import { query, queryOne, type Queryable } from "@/lib/db";

export interface SessionRow {
  id: string;
  tenant_id: string | null;
  membership_id: string | null;
  platform_user_id: string | null;
  token_hash: string;
  ip_hash: string | null;
  user_agent_hash: string | null;
  expires_at: Date;
  revoked_at: Date | null;
  created_at: Date;
  last_seen_at: Date;
}

export interface CreateSessionInput {
  tenantId?: string;
  membershipId?: string;
  platformUserId?: string;
  tokenHash: string;
  ipHash?: string;
  userAgentHash?: string;
  expiresAt: Date;
}

export async function createSessionRow(db: Queryable, input: CreateSessionInput): Promise<SessionRow> {
  const row = await queryOne<SessionRow>(
    db,
    `INSERT INTO sessions (tenant_id, membership_id, platform_user_id, token_hash, ip_hash, user_agent_hash, expires_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     RETURNING *`,
    [
      input.tenantId ?? null,
      input.membershipId ?? null,
      input.platformUserId ?? null,
      input.tokenHash,
      input.ipHash ?? null,
      input.userAgentHash ?? null,
      input.expiresAt
    ]
  );
  if (!row) throw new Error("session insert returned no row");
  return row;
}

/** Expiry is enforced here, server-side, regardless of cookie lifetime. */
export async function findActiveSessionByTokenHash(db: Queryable, tokenHash: string): Promise<SessionRow | null> {
  return queryOne<SessionRow>(
    db,
    `UPDATE sessions SET last_seen_at = now()
     WHERE token_hash = $1 AND revoked_at IS NULL AND expires_at > now()
     RETURNING *`,
    [tokenHash]
  );
}

export async function revokeSessionById(db: Queryable, sessionId: string): Promise<void> {
  await query(db, "UPDATE sessions SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL", [sessionId]);
}

export async function revokeSessionsForMembership(db: Queryable, tenantId: string, membershipId: string): Promise<number> {
  const rows = await query(
    db,
    `UPDATE sessions SET revoked_at = now()
     WHERE tenant_id = $1 AND membership_id = $2 AND revoked_at IS NULL
     RETURNING id`,
    [tenantId, membershipId]
  );
  return rows.length;
}

export async function revokeSessionsForPlatformUser(db: Queryable, platformUserId: string, exceptSessionId?: string): Promise<number> {
  const rows = await query(
    db,
    `UPDATE sessions SET revoked_at = now()
     WHERE platform_user_id = $1 AND revoked_at IS NULL AND ($2::uuid IS NULL OR id <> $2)
     RETURNING id`,
    [platformUserId, exceptSessionId ?? null]
  );
  return rows.length;
}

export async function revokeSessionsForTenant(db: Queryable, tenantId: string): Promise<number> {
  const rows = await query(
    db,
    "UPDATE sessions SET revoked_at = now() WHERE tenant_id = $1 AND revoked_at IS NULL RETURNING id",
    [tenantId]
  );
  return rows.length;
}
