-- MFA storage for platform users and a shared fixed-window rate-limit table.

ALTER TABLE platform_users
  ADD COLUMN mfa_totp_secret_encrypted text,
  ADD COLUMN mfa_enabled_at timestamptz;

-- Fixed-window counters shared by all instances; DATABASE-backed so limits
-- hold before any Redis is introduced.
CREATE TABLE rate_limit_buckets (
  key text NOT NULL,
  window_started_at timestamptz NOT NULL,
  count integer NOT NULL DEFAULT 0,
  PRIMARY KEY (key, window_started_at)
);

CREATE INDEX rate_limit_buckets_window_idx ON rate_limit_buckets (window_started_at);

-- Single-use tokens that carry a successful root-domain friend login onto the
-- tenant subdomain, where the host-only session cookie can actually be set.
CREATE TABLE login_handoffs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  membership_id uuid NOT NULL REFERENCES memberships(id) ON DELETE CASCADE,
  token_hash text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX login_handoffs_expiry_idx ON login_handoffs (expires_at);
