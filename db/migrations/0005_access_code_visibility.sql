-- ADR-006: the event access code stays visible to the event admin, so it is
-- stored encrypted (sealed with the app secret) alongside the authoritative
-- hash. Rows predating this migration have no recoverable code until the
-- admin rotates once.
ALTER TABLE events ADD COLUMN access_code_encrypted text;
