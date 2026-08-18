-- Database-backed background jobs and album exports.

CREATE TYPE job_status AS ENUM ('queued', 'running', 'succeeded', 'failed', 'dead');

CREATE TABLE jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text NOT NULL,
  tenant_id uuid REFERENCES tenants(id) ON DELETE CASCADE,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status job_status NOT NULL DEFAULT 'queued',
  attempts integer NOT NULL DEFAULT 0,
  max_attempts integer NOT NULL DEFAULT 3,
  run_at timestamptz NOT NULL DEFAULT now(),
  locked_at timestamptz,
  locked_by text,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz
);

CREATE INDEX jobs_claim_idx ON jobs (run_at) WHERE status IN ('queued', 'failed');

CREATE TYPE export_status AS ENUM ('queued', 'running', 'completed', 'failed');

CREATE TABLE exports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  requested_by_membership_id uuid NOT NULL REFERENCES memberships(id),
  job_id uuid REFERENCES jobs(id) ON DELETE SET NULL,
  status export_status NOT NULL DEFAULT 'queued',
  object_key text,
  photo_count integer,
  byte_size bigint,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  expires_at timestamptz
);

-- One active export per tenant, enforced by the database.
CREATE UNIQUE INDEX exports_one_active_idx ON exports (tenant_id) WHERE status IN ('queued', 'running');
