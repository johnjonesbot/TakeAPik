-- Guests can be reached by email and/or phone (SMS invites). Email becomes
-- optional; at least one contact is required. Uniqueness per tenant is now
-- partial so a null contact doesn't collide.
ALTER TABLE memberships ALTER COLUMN email DROP NOT NULL;
ALTER TABLE memberships ADD COLUMN phone text;

ALTER TABLE memberships DROP CONSTRAINT memberships_tenant_id_email_key;
CREATE UNIQUE INDEX memberships_tenant_email_key ON memberships (tenant_id, email) WHERE email IS NOT NULL;
CREATE UNIQUE INDEX memberships_tenant_phone_key ON memberships (tenant_id, phone) WHERE phone IS NOT NULL;

ALTER TABLE memberships ADD CONSTRAINT memberships_contact_check CHECK (email IS NOT NULL OR phone IS NOT NULL);
