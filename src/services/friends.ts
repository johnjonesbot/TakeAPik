import { getPool, isUniqueViolation, withTransaction } from "@/lib/db";
import { normalizeEmail } from "@/lib/normalize";
import { normalizePhone } from "@/lib/phone";
import {
  createMembership,
  disableMembership,
  findMembershipById,
  listMemberships
} from "@/lib/repositories/memberships";
import { revokeSessionsForMembership } from "@/lib/repositories/sessions";
import type { MembershipRow } from "@/lib/repositories/types";
import { queryOne } from "@/lib/db";
import { writeAuditEvent } from "@/services/audit";
import { sendInvitationForNewMember } from "@/services/invitations";
import { getLogger } from "@/lib/logger";
import type { AdminActor } from "@/services/event-admin";

export interface FriendView {
  id: string;
  email: string | null;
  phone: string | null;
  name: string;
  role: "admin" | "friend";
  disabled: boolean;
  createdAt: string;
}

function toView(row: MembershipRow): FriendView {
  return {
    id: row.id,
    email: row.email,
    phone: row.phone,
    name: row.friend_name,
    role: row.role,
    disabled: row.disabled_at !== null,
    createdAt: row.created_at.toISOString()
  };
}

export async function listFriends(actor: AdminActor): Promise<FriendView[]> {
  return (await listMemberships(getPool(), actor.tenantId)).map(toView);
}

export type CreateFriendResult =
  | { outcome: "created"; friend: FriendView }
  | { outcome: "duplicate-email" }
  | { outcome: "invalid-contact" };

export interface CreateFriendInput {
  name: string;
  email?: string | null;
  phone?: string | null;
}

export async function createFriend(
  actor: AdminActor,
  input: CreateFriendInput
): Promise<CreateFriendResult> {
  const email = input.email && input.email.trim() ? normalizeEmail(input.email) : null;
  const phone = input.phone && input.phone.trim() ? normalizePhone(input.phone) : null;
  if (input.phone && input.phone.trim() && !phone) return { outcome: "invalid-contact" };
  if (!email && !phone) return { outcome: "invalid-contact" };
  try {
    return await withTransaction(async (client) => {
      const membership = await createMembership(client, {
        tenantId: actor.tenantId,
        email,
        phone,
        friendName: input.name.trim()
      });
      await writeAuditEvent(client, {
        tenantId: actor.tenantId,
        actorPlatformUserId: actor.platformUserId,
        actorMembershipId: actor.membershipId,
        action: "member.create",
        targetType: "membership",
        targetId: membership.id
      });
      return { outcome: "created" as const, friend: toView(membership) };
    });
  } catch (error) {
    if (isUniqueViolation(error)) return { outcome: "duplicate-email" };
    throw error;
  }
}

/**
 * createFriend plus the product rule that every added friend immediately
 * receives their invitation email. The email is best-effort: a send failure
 * records on the invitation row (visible and resendable in the admin UI) and
 * never undoes the add.
 */
export async function createFriendAndInvite(
  actor: AdminActor,
  input: CreateFriendInput
): Promise<CreateFriendResult> {
  const result = await createFriend(actor, input);
  if (result.outcome === "created") {
    try {
      await sendInvitationForNewMember(actor, result.friend.id);
    } catch (error) {
      getLogger().warn("auto-invite failed after friend add", {
        membershipId: result.friend.id,
        error: error instanceof Error ? error.message : "unknown"
      });
    }
  }
  return result;
}

export interface ImportResult {
  created: FriendView[];
  duplicates: string[];
}

/** Bulk import; each row stands alone so one duplicate never blocks the rest. */
export async function importFriends(
  actor: AdminActor,
  rows: Array<{ email: string; name: string }>
): Promise<ImportResult> {
  const created: FriendView[] = [];
  const duplicates: string[] = [];
  for (const row of rows) {
    const result = await createFriendAndInvite(actor, row);
    if (result.outcome === "created") created.push(result.friend);
    else duplicates.push(normalizeEmail(row.email));
  }
  return { created, duplicates };
}

export async function renameFriend(actor: AdminActor, membershipId: string, name: string): Promise<FriendView | null> {
  return withTransaction(async (client) => {
    const updated = await queryOne<MembershipRow>(
      client,
      `UPDATE memberships SET friend_name = $3, updated_at = now()
       WHERE tenant_id = $1 AND id = $2
       RETURNING *`,
      [actor.tenantId, membershipId, name.trim()]
    );
    if (!updated) return null;
    await writeAuditEvent(client, {
      tenantId: actor.tenantId,
      actorPlatformUserId: actor.platformUserId,
      actorMembershipId: actor.membershipId,
      action: "member.update",
      targetType: "membership",
      targetId: membershipId,
      metadata: { change: "rename" }
    });
    return toView(updated);
  });
}

export type DisableFriendResult = "disabled" | "not-found" | "cannot-disable-self";

/** Disabling a member also revokes their active sessions immediately. */
export async function disableFriend(actor: AdminActor, membershipId: string): Promise<DisableFriendResult> {
  if (membershipId === actor.membershipId) return "cannot-disable-self";
  return withTransaction(async (client) => {
    const target = await findMembershipById(client, actor.tenantId, membershipId);
    if (!target || target.disabled_at) return "not-found" as const;
    await disableMembership(client, actor.tenantId, membershipId);
    const revoked = await revokeSessionsForMembership(client, actor.tenantId, membershipId);
    await writeAuditEvent(client, {
      tenantId: actor.tenantId,
      actorPlatformUserId: actor.platformUserId,
      actorMembershipId: actor.membershipId,
      action: "member.disable",
      targetType: "membership",
      targetId: membershipId,
      metadata: { revokedSessions: revoked }
    });
    return "disabled" as const;
  });
}
