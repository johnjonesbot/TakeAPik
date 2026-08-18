export type AlbumStatus = "draft" | "active" | "archived";
export type MembershipRole = "admin" | "friend";
export type PhotoStatus = "pending" | "ready" | "rejected" | "deleted";

export interface PlatformUserRow {
  id: string;
  email: string;
  password_hash: string;
  display_name: string;
  is_super_admin: boolean;
  disabled_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface TenantRow {
  id: string;
  slug: string;
  owner_user_id: string;
  display_name: string;
  status: AlbumStatus;
  archived_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface EventRow {
  id: string;
  tenant_id: string;
  name: string;
  access_code_hash: string;
  access_code_last_changed_at: Date;
  starts_at: Date | null;
  timezone: string;
  cover_photo_id: string | null;
  created_at: Date;
  updated_at: Date;
}

export interface MembershipRow {
  id: string;
  tenant_id: string;
  platform_user_id: string | null;
  email: string;
  friend_name: string;
  role: MembershipRole;
  disabled_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

export interface AuditLogRow {
  id: string;
  tenant_id: string | null;
  actor_platform_user_id: string | null;
  actor_membership_id: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  metadata: Record<string, unknown>;
  ip_hash: string | null;
  created_at: Date;
}
