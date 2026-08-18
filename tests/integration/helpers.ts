import { randomUUID } from "node:crypto";
import { getPool } from "@/lib/db";
import { provisionTenant, type ProvisionTenantResult } from "@/services/provisioning";

/** Order respects foreign keys; audit_logs is included because tests assert on it. */
const TENANT_TABLES = ["audit_logs", "photos", "invitations", "sessions", "memberships", "events", "tenants", "platform_users"];

export async function truncateAll(): Promise<void> {
  await getPool().query(`TRUNCATE ${TENANT_TABLES.join(", ")} RESTART IDENTITY CASCADE`);
}

/** Fixed but syntactically valid Argon2id hash; login is not under test in Phase 1. */
export const PLACEHOLDER_PASSWORD_HASH =
  "$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHRzb21lc2FsdA$K5d2ZXJ5ZmFrZWhhc2hmb3J0ZXN0aW5nMDAwMDA";

export async function provisionTestTenant(overrides: Partial<Parameters<typeof provisionTenant>[0]> = {}): Promise<ProvisionTenantResult> {
  return provisionTenant({
    ownerEmail: `owner-${randomUUID()}@example.test`,
    ownerDisplayName: "John Jones",
    ownerPasswordHash: PLACEHOLDER_PASSWORD_HASH,
    eventName: "Test Event",
    actorPlatformUserId: await ensureSuperAdmin(),
    ...overrides
  });
}

let superAdminId: string | undefined;

async function ensureSuperAdmin(): Promise<string> {
  if (superAdminId) return superAdminId;
  const result = await getPool().query<{ id: string }>(
    `INSERT INTO platform_users (email, password_hash, display_name, is_super_admin)
     VALUES ($1, $2, 'Test Super Admin', true)
     ON CONFLICT (email) DO UPDATE SET updated_at = now()
     RETURNING id`,
    [`super-${randomUUID()}@example.test`, PLACEHOLDER_PASSWORD_HASH]
  );
  superAdminId = result.rows[0]?.id;
  if (!superAdminId) throw new Error("failed to create test super admin");
  return superAdminId;
}

export function resetHelperState(): void {
  superAdminId = undefined;
}
