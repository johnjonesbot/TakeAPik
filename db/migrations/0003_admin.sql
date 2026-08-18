-- Invitation delivery retries and idempotent admin operations.

ALTER TABLE invitations ADD COLUMN attempts integer NOT NULL DEFAULT 0;

-- Stored responses for idempotency-keyed operations (e.g. send-all invites):
-- a retry with the same key returns the recorded outcome instead of re-running.
CREATE TABLE idempotency_keys (
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  purpose text NOT NULL,
  key text NOT NULL,
  response jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tenant_id, purpose, key)
);

CREATE INDEX idempotency_keys_age_idx ON idempotency_keys (created_at);
