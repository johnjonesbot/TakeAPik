-- TakeAPik PostgreSQL 16+ schema. Migrations should copy this model into numbered files.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

CREATE TYPE album_status AS ENUM ('draft', 'active', 'archived');
CREATE TYPE membership_role AS ENUM ('admin', 'friend');
CREATE TYPE invite_status AS ENUM ('pending', 'sent', 'delivered', 'failed', 'revoked');
CREATE TYPE photo_status AS ENUM ('pending', 'ready', 'rejected', 'deleted');

CREATE TABLE platform_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email citext NOT NULL UNIQUE,
  password_hash text NOT NULL,
  display_name text NOT NULL,
  is_super_admin boolean NOT NULL DEFAULT false,
  disabled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE tenants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug text NOT NULL UNIQUE CHECK (slug ~ '^[a-z][a-z0-9-]{0,61}[a-z0-9]$'),
  owner_user_id uuid NOT NULL REFERENCES platform_users(id),
  display_name text NOT NULL,
  status album_status NOT NULL DEFAULT 'draft',
  archived_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL UNIQUE REFERENCES tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  access_code_hash text NOT NULL,
  access_code_last_changed_at timestamptz NOT NULL DEFAULT now(),
  starts_at timestamptz,
  timezone text NOT NULL DEFAULT 'UTC',
  cover_photo_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  platform_user_id uuid REFERENCES platform_users(id) ON DELETE SET NULL,
  email citext NOT NULL,
  friend_name text NOT NULL,
  role membership_role NOT NULL DEFAULT 'friend',
  disabled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, email)
);

CREATE TABLE sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  membership_id uuid REFERENCES memberships(id) ON DELETE CASCADE,
  platform_user_id uuid REFERENCES platform_users(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  ip_hash text,
  user_agent_hash text,
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  CHECK (membership_id IS NOT NULL OR platform_user_id IS NOT NULL)
);

CREATE TABLE invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  membership_id uuid NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
  status invite_status NOT NULL DEFAULT 'pending',
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  sent_at timestamptz,
  accepted_at timestamptz,
  provider_message_id text,
  failure_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE photos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  uploaded_by_membership_id uuid NOT NULL REFERENCES memberships(id),
  object_key text NOT NULL UNIQUE,
  thumbnail_key text,
  original_filename text NOT NULL,
  mime_type text NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
  byte_size bigint NOT NULL CHECK (byte_size > 0),
  width integer NOT NULL CHECK (width > 0 AND width <= 1920),
  height integer NOT NULL CHECK (height > 0),
  description text CHECK (char_length(description) <= 1000),
  checksum_sha256 text NOT NULL,
  status photo_status NOT NULL DEFAULT 'pending',
  captured_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  ready_at timestamptz,
  deleted_at timestamptz
);

ALTER TABLE events ADD CONSTRAINT events_cover_photo_fk
  FOREIGN KEY (cover_photo_id) REFERENCES photos(id) ON DELETE SET NULL;

CREATE TABLE audit_logs (
  id bigserial PRIMARY KEY,
  tenant_id uuid REFERENCES tenants(id) ON DELETE SET NULL,
  actor_platform_user_id uuid REFERENCES platform_users(id) ON DELETE SET NULL,
  actor_membership_id uuid REFERENCES memberships(id) ON DELETE SET NULL,
  action text NOT NULL,
  target_type text NOT NULL,
  target_id text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  ip_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX memberships_tenant_role_idx ON memberships (tenant_id, role) WHERE disabled_at IS NULL;
CREATE INDEX sessions_expiry_idx ON sessions (expires_at) WHERE revoked_at IS NULL;
CREATE INDEX invitations_tenant_status_idx ON invitations (tenant_id, status);
CREATE INDEX photos_tenant_feed_idx ON photos (tenant_id, created_at DESC, id DESC) WHERE status = 'ready' AND deleted_at IS NULL;
CREATE INDEX photos_uploader_idx ON photos (tenant_id, uploaded_by_membership_id, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX audit_logs_tenant_time_idx ON audit_logs (tenant_id, created_at DESC);

-- Application queries must always scope tenant-owned tables by tenant_id. If direct
-- client access is added later, enable PostgreSQL RLS and set app.tenant_id per transaction.
