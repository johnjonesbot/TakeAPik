import { getEnv } from "@/lib/env";
import { getPool, query, queryOne, withTransaction } from "@/lib/db";
import { buildInviteEmail } from "@/lib/invite-email";
import { getMailer } from "@/lib/mailer";
import { PostgresRateLimiter, type RateLimiter } from "@/lib/rate-limit";
import { findEventByTenant } from "@/lib/repositories/events";
import { generateOpaqueToken, hashToken } from "@/lib/tokens";
import { writeAuditEvent } from "@/services/audit";
import type { AdminActor } from "@/services/event-admin";

const INVITE_TTL_DAYS = 14;
const MAX_ATTEMPTS = 3;

export interface InvitationView {
  id: string;
  membershipId: string;
  status: "pending" | "sent" | "delivered" | "failed" | "revoked";
  attempts: number;
  sentAt: string | null;
  failureReason: string | null;
}

interface InvitationRow {
  id: string;
  tenant_id: string;
  membership_id: string;
  status: InvitationView["status"];
  attempts: number;
  sent_at: Date | null;
  failure_reason: string | null;
  expires_at: Date;
}

function toView(row: InvitationRow): InvitationView {
  return {
    id: row.id,
    membershipId: row.membership_id,
    status: row.status,
    attempts: row.attempts,
    sentAt: row.sent_at ? row.sent_at.toISOString() : null,
    failureReason: row.failure_reason
  };
}

export interface SendInvitationsInput {
  /** Explicit membership IDs, or every active friend without a sent invite. */
  membershipIds?: string[];
  idempotencyKey: string;
}

export type SendInvitationsResult =
  | { outcome: "sent"; invitations: InvitationView[]; replayed: boolean }
  | { outcome: "rate-limited" }
  | { outcome: "event-missing" };

interface TargetRow {
  membership_id: string;
  email: string;
  friend_name: string;
}

function canonicalInviteUrl(slug: string, token: string): string {
  const env = getEnv();
  const scheme = env.APP_URL.startsWith("https") ? "https" : "http";
  return `${scheme}://${slug}.${env.ROOT_DOMAIN}/invite?token=${token}`;
}

/**
 * Send invitations for selected members (or all unsent). The idempotency key
 * makes retries safe: a replay returns the recorded outcome and never emails
 * anyone twice. Individual sends have bounded attempts.
 */
export async function sendInvitations(
  actor: AdminActor,
  tenantSlug: string,
  input: SendInvitationsInput,
  limiter: RateLimiter = new PostgresRateLimiter(getPool())
): Promise<SendInvitationsResult> {
  const db = getPool();

  const replayed = await queryOne<{ response: { invitations: InvitationView[] } }>(
    db,
    "SELECT response FROM idempotency_keys WHERE tenant_id = $1 AND purpose = 'invite-send' AND key = $2",
    [actor.tenantId, input.idempotencyKey]
  );
  if (replayed) return { outcome: "sent", invitations: replayed.response.invitations, replayed: true };

  const event = await findEventByTenant(db, actor.tenantId);
  if (!event) return { outcome: "event-missing" };

  const targets = input.membershipIds?.length
    ? await query<TargetRow>(
        db,
        `SELECT id AS membership_id, email, friend_name FROM memberships
         WHERE tenant_id = $1 AND id = ANY($2::uuid[]) AND disabled_at IS NULL`,
        [actor.tenantId, input.membershipIds]
      )
    : await query<TargetRow>(
        db,
        `SELECT m.id AS membership_id, m.email, m.friend_name FROM memberships m
         WHERE m.tenant_id = $1 AND m.disabled_at IS NULL AND m.role = 'friend'
           AND NOT EXISTS (
             SELECT 1 FROM invitations i
             WHERE i.tenant_id = $1 AND i.membership_id = m.id AND i.status IN ('sent', 'delivered')
           )`,
        [actor.tenantId]
      );

  const quota = await limiter.consume(`invite-send:${actor.tenantId}`, 100, 60 * 60);
  if (!quota.allowed) return { outcome: "rate-limited" };

  const results: InvitationView[] = [];
  for (const target of targets) {
    results.push(await sendOne(actor, tenantSlug, event.name, target));
  }

  await queryOne(
    db,
    `INSERT INTO idempotency_keys (tenant_id, purpose, key, response)
     VALUES ($1, 'invite-send', $2, $3)
     ON CONFLICT (tenant_id, purpose, key) DO NOTHING
     RETURNING key`,
    [actor.tenantId, input.idempotencyKey, JSON.stringify({ invitations: results })]
  );

  await writeAuditEvent(db, {
    tenantId: actor.tenantId,
    actorPlatformUserId: actor.platformUserId,
    actorMembershipId: actor.membershipId,
    action: "invite.send",
    targetType: "tenant",
    targetId: actor.tenantId,
    metadata: {
      requested: targets.length,
      sent: results.filter((invitation) => invitation.status === "sent").length,
      failed: results.filter((invitation) => invitation.status === "failed").length
    }
  });

  return { outcome: "sent", invitations: results, replayed: false };
}

async function sendOne(
  actor: AdminActor,
  tenantSlug: string,
  eventName: string,
  target: TargetRow
): Promise<InvitationView> {
  const token = generateOpaqueToken();
  const expiresAt = new Date(Date.now() + INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);

  const invitation = await withTransaction(async (client) => {
    return queryOne<InvitationRow>(
      client,
      `INSERT INTO invitations (tenant_id, membership_id, token_hash, expires_at, status, attempts)
       VALUES ($1, $2, $3, $4, 'pending', 0)
       RETURNING *`,
      [actor.tenantId, target.membership_id, hashToken(token), expiresAt]
    );
  });
  if (!invitation) throw new Error("invitation insert returned no row");

  return deliverInvitation(invitation, token, eventName, tenantSlug, target);
}

async function deliverInvitation(
  invitation: InvitationRow,
  token: string,
  eventName: string,
  tenantSlug: string,
  target: TargetRow
): Promise<InvitationView> {
  const db = getPool();
  const content = buildInviteEmail({
    friendName: target.friend_name,
    eventName,
    inviteUrl: canonicalInviteUrl(tenantSlug, token),
    expiresAt: invitation.expires_at
  });

  try {
    const sent = await getMailer().send({ to: target.email, ...content });
    const updated = await queryOne<InvitationRow>(
      db,
      `UPDATE invitations
       SET status = 'sent', sent_at = now(), attempts = attempts + 1, provider_message_id = $3, failure_reason = NULL
       WHERE tenant_id = $1 AND id = $2
       RETURNING *`,
      [invitation.tenant_id, invitation.id, sent.messageId]
    );
    return toView(updated ?? invitation);
  } catch (error) {
    const reason = error instanceof Error ? error.message.slice(0, 200) : "send-failed";
    const updated = await queryOne<InvitationRow>(
      db,
      `UPDATE invitations
       SET status = 'failed', attempts = attempts + 1, failure_reason = $3
       WHERE tenant_id = $1 AND id = $2
       RETURNING *`,
      [invitation.tenant_id, invitation.id, reason]
    );
    return toView(updated ?? invitation);
  }
}

export async function listInvitations(actor: AdminActor): Promise<InvitationView[]> {
  const rows = await query<InvitationRow>(
    getPool(),
    "SELECT * FROM invitations WHERE tenant_id = $1 ORDER BY created_at DESC, id DESC LIMIT 500",
    [actor.tenantId]
  );
  return rows.map(toView);
}

export type ResendResult = { outcome: "sent"; invitation: InvitationView } | { outcome: "not-found" } | { outcome: "attempts-exhausted" };

/** Admin retry for a failed invitation; a fresh token replaces the old one. */
export async function resendInvitation(actor: AdminActor, tenantSlug: string, invitationId: string): Promise<ResendResult> {
  const db = getPool();
  const invitation = await queryOne<InvitationRow>(
    db,
    "SELECT * FROM invitations WHERE tenant_id = $1 AND id = $2 AND status = 'failed'",
    [actor.tenantId, invitationId]
  );
  if (!invitation) return { outcome: "not-found" };
  if (invitation.attempts >= MAX_ATTEMPTS) return { outcome: "attempts-exhausted" };

  const event = await findEventByTenant(db, actor.tenantId);
  const target = await queryOne<TargetRow>(
    db,
    "SELECT id AS membership_id, email, friend_name FROM memberships WHERE tenant_id = $1 AND id = $2 AND disabled_at IS NULL",
    [actor.tenantId, invitation.membership_id]
  );
  if (!event || !target) return { outcome: "not-found" };

  const token = generateOpaqueToken();
  const refreshed = await queryOne<InvitationRow>(
    db,
    `UPDATE invitations SET token_hash = $3, expires_at = now() + interval '${INVITE_TTL_DAYS} days'
     WHERE tenant_id = $1 AND id = $2
     RETURNING *`,
    [actor.tenantId, invitationId, hashToken(token)]
  );
  if (!refreshed) return { outcome: "not-found" };

  const view = await deliverInvitation(refreshed, token, event.name, tenantSlug, target);
  return { outcome: "sent", invitation: view };
}

export interface AcceptedInvite {
  membershipEmail: string;
  eventName: string;
}

/**
 * Resolve an invite link on the tenant host. Marks first use; the link never
 * reveals the access code, so possession alone cannot open the album.
 */
export async function acceptInvitation(token: string, tenantId: string): Promise<AcceptedInvite | null> {
  const db = getPool();
  const row = await queryOne<{ membership_id: string; email: string; event_name: string }>(
    db,
    `UPDATE invitations i
     SET accepted_at = COALESCE(i.accepted_at, now())
     FROM memberships m, events e
     WHERE i.token_hash = $1 AND i.tenant_id = $2 AND i.expires_at > now() AND i.status <> 'revoked'
       AND m.tenant_id = i.tenant_id AND m.id = i.membership_id AND m.disabled_at IS NULL
       AND e.tenant_id = i.tenant_id
     RETURNING i.membership_id, m.email, e.name AS event_name`,
    [hashToken(token), tenantId]
  );
  if (!row) return null;
  return { membershipEmail: row.email, eventName: row.event_name };
}
