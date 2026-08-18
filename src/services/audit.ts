import { queryOne, type Queryable } from "@/lib/db";
import type { AuditLogRow } from "@/lib/repositories/types";

export type AuditAction =
  | "auth.friend.login.success"
  | "auth.friend.login.failure"
  | "auth.admin.login.success"
  | "auth.admin.login.failure"
  | "auth.logout"
  | "member.create"
  | "member.update"
  | "member.disable"
  | "invite.send"
  | "invite.revoke"
  | "event.access_code.rotate"
  | "album.export.request"
  | "tenant.provision"
  | "tenant.archive"
  | "platform.super_admin.bootstrap";

export interface AuditEventInput {
  tenantId?: string;
  actorPlatformUserId?: string;
  actorMembershipId?: string;
  action: AuditAction;
  targetType: string;
  targetId?: string;
  /** Only stable internal identifiers and outcomes; never secrets or raw PII. */
  metadata?: Record<string, unknown>;
  ipHash?: string;
}

/**
 * Append an audit event. Rows are insert-only: nothing in the application
 * ever updates or deletes from audit_logs.
 */
export async function writeAuditEvent(db: Queryable, input: AuditEventInput): Promise<AuditLogRow> {
  const row = await queryOne<AuditLogRow>(
    db,
    `INSERT INTO audit_logs (tenant_id, actor_platform_user_id, actor_membership_id, action, target_type, target_id, metadata, ip_hash)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      input.tenantId ?? null,
      input.actorPlatformUserId ?? null,
      input.actorMembershipId ?? null,
      input.action,
      input.targetType,
      input.targetId ?? null,
      JSON.stringify(input.metadata ?? {}),
      input.ipHash ?? null
    ]
  );
  if (!row) throw new Error("audit insert returned no row");
  return row;
}
