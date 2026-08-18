import { getPool } from "@/lib/db";
import { queryOne } from "@/lib/db";
import { generateOpaqueToken, hashToken } from "@/lib/tokens";

const HANDOFF_TTL_SECONDS = 60;

export interface HandoffGrant {
  /** Plaintext, single-use, 60-second token; never stored or logged. */
  token: string;
  tenantSlug: string;
}

export async function createLoginHandoff(tenantId: string, membershipId: string, tenantSlug: string): Promise<HandoffGrant> {
  const token = generateOpaqueToken();
  await queryOne(
    getPool(),
    `INSERT INTO login_handoffs (tenant_id, membership_id, token_hash, expires_at)
     VALUES ($1, $2, $3, now() + make_interval(secs => $4)) RETURNING id`,
    [tenantId, membershipId, hashToken(token), HANDOFF_TTL_SECONDS]
  );
  return { token, tenantSlug };
}

export interface ConsumedHandoff {
  tenantId: string;
  membershipId: string;
}

/**
 * Atomically consume a handoff token for the given tenant. Expired, foreign,
 * or already-consumed tokens all return null identically.
 */
export async function consumeLoginHandoff(token: string, tenantId: string): Promise<ConsumedHandoff | null> {
  const row = await queryOne<{ tenant_id: string; membership_id: string }>(
    getPool(),
    `UPDATE login_handoffs SET consumed_at = now()
     WHERE token_hash = $1 AND tenant_id = $2 AND consumed_at IS NULL AND expires_at > now()
     RETURNING tenant_id, membership_id`,
    [hashToken(token), tenantId]
  );
  if (!row) return null;
  return { tenantId: row.tenant_id, membershipId: row.membership_id };
}
