import { query, queryOne, type Queryable } from "@/lib/db";
import type { MembershipRow, MembershipRole } from "@/lib/repositories/types";

export async function findMembershipById(db: Queryable, tenantId: string, membershipId: string): Promise<MembershipRow | null> {
  return queryOne<MembershipRow>(db, "SELECT * FROM memberships WHERE tenant_id = $1 AND id = $2", [
    tenantId,
    membershipId
  ]);
}

export async function findActiveMembershipByEmail(db: Queryable, tenantId: string, email: string): Promise<MembershipRow | null> {
  return queryOne<MembershipRow>(
    db,
    "SELECT * FROM memberships WHERE tenant_id = $1 AND email = $2 AND disabled_at IS NULL",
    [tenantId, email]
  );
}

export async function findActiveMembershipByPhone(db: Queryable, tenantId: string, phone: string): Promise<MembershipRow | null> {
  return queryOne<MembershipRow>(
    db,
    "SELECT * FROM memberships WHERE tenant_id = $1 AND phone = $2 AND disabled_at IS NULL",
    [tenantId, phone]
  );
}

export async function listMemberships(db: Queryable, tenantId: string): Promise<MembershipRow[]> {
  return query<MembershipRow>(db, "SELECT * FROM memberships WHERE tenant_id = $1 ORDER BY created_at, id", [tenantId]);
}

export interface CreateMembershipInput {
  tenantId: string;
  email?: string | null;
  phone?: string | null;
  friendName: string;
  role?: MembershipRole;
  platformUserId?: string;
}

export async function createMembership(db: Queryable, input: CreateMembershipInput): Promise<MembershipRow> {
  const row = await queryOne<MembershipRow>(
    db,
    `INSERT INTO memberships (tenant_id, email, phone, friend_name, role, platform_user_id)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING *`,
    [input.tenantId, input.email ?? null, input.phone ?? null, input.friendName, input.role ?? "friend", input.platformUserId ?? null]
  );
  if (!row) throw new Error("membership insert returned no row");
  return row;
}

export async function disableMembership(db: Queryable, tenantId: string, membershipId: string): Promise<MembershipRow | null> {
  return queryOne<MembershipRow>(
    db,
    `UPDATE memberships
     SET disabled_at = now(), updated_at = now()
     WHERE tenant_id = $1 AND id = $2 AND disabled_at IS NULL
     RETURNING *`,
    [tenantId, membershipId]
  );
}
