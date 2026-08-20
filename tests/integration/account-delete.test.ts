import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closePool, getPool } from "@/lib/db";
import { sealSecret } from "@/lib/secret-box";
import { generateTotpSecret, totpCode } from "@/lib/totp";
import { setStorageForTesting } from "@/lib/storage";
import {
  deleteAdminAccountAsSuperAdmin,
  purgeAlbumContentAsSuperAdmin,
  type SuperAdminActor
} from "@/services/platform-admin";
import { createFriend } from "@/services/friends";
import type { AdminActor } from "@/services/event-admin";
import { FakeStorage } from "./fake-storage";
import { provisionTestTenant, resetHelperState, truncateAll, type ProvisionedTenant } from "./helpers";

async function makeSuperAdmin(): Promise<{ actor: SuperAdminActor; totpSecret: string }> {
  const totpSecret = generateTotpSecret();
  const row = await getPool().query<{ id: string }>(
    `INSERT INTO platform_users (email, password_hash, display_name, is_super_admin, mfa_totp_secret_encrypted, mfa_enabled_at)
     VALUES ('root-delete@example.test', 'x', 'Root', true, $1, now()) RETURNING id`,
    [sealSecret(totpSecret, "totp")]
  );
  return {
    actor: { kind: "super-admin", platformUserId: row.rows[0]!.id, sessionId: "test-session" },
    totpSecret
  };
}

function adminActor(tenant: ProvisionedTenant): AdminActor {
  return {
    kind: "admin",
    tenantId: tenant.tenant.id,
    membershipId: tenant.ownerMembership.id,
    platformUserId: tenant.owner.id,
    sessionId: "test-session"
  };
}

describe("super-admin account deletion", () => {
  beforeEach(async () => {
    await truncateAll();
    resetHelperState();
    setStorageForTesting(new FakeStorage());
  });

  afterAll(async () => {
    setStorageForTesting(undefined);
    await closePool();
  });

  it("deletes an emptied account entirely and frees the slug for reuse", async () => {
    const { actor, totpSecret } = await makeSuperAdmin();
    const tenant = await provisionTestTenant();
    const slug = tenant.tenant.slug;

    const result = await deleteAdminAccountAsSuperAdmin(actor, tenant.owner.id, {
      confirmEmail: tenant.owner.email.toUpperCase(),
      totpCode: totpCode(totpSecret)
    });
    expect(result).toMatchObject({ outcome: "deleted", freedSlug: slug });

    const db = getPool();
    expect((await db.query(`SELECT 1 FROM platform_users WHERE id = $1`, [tenant.owner.id])).rowCount).toBe(0);
    expect((await db.query(`SELECT 1 FROM tenants WHERE id = $1`, [tenant.tenant.id])).rowCount).toBe(0);

    const audit = await db.query(`SELECT metadata FROM audit_logs WHERE action = 'account.delete'`);
    expect(audit.rowCount).toBe(1);
    expect(audit.rows[0]?.metadata?.freedSlug).toBe(slug);

    // Same initials provision again → the freed slug is genuinely reusable.
    const reused = await provisionTestTenant();
    expect(reused.tenant.slug).toBe(slug);
  });

  it("refuses while album content remains, then succeeds after a purge", async () => {
    const { actor, totpSecret } = await makeSuperAdmin();
    const tenant = await provisionTestTenant();
    const created = await createFriend(adminActor(tenant), { email: "guest@example.test", name: "Guest" });
    expect(created.outcome).toBe("created");

    const blocked = await deleteAdminAccountAsSuperAdmin(actor, tenant.owner.id, {
      confirmEmail: tenant.owner.email,
      totpCode: totpCode(totpSecret)
    });
    expect(blocked.outcome).toBe("content-present");

    await purgeAlbumContentAsSuperAdmin(actor, tenant.tenant.id, { totpCode: totpCode(totpSecret) });
    const after = await deleteAdminAccountAsSuperAdmin(actor, tenant.owner.id, {
      confirmEmail: tenant.owner.email,
      totpCode: totpCode(totpSecret)
    });
    expect(after.outcome).toBe("deleted");
  });

  it("rejects wrong email confirmation, super-admin targets, and bad TOTP", async () => {
    const { actor, totpSecret } = await makeSuperAdmin();
    const tenant = await provisionTestTenant();

    expect(
      (await deleteAdminAccountAsSuperAdmin(actor, tenant.owner.id, {
        confirmEmail: "someone-else@example.test",
        totpCode: totpCode(totpSecret)
      })).outcome
    ).toBe("confirm-mismatch");

    expect(
      (await deleteAdminAccountAsSuperAdmin(actor, actor.platformUserId, {
        confirmEmail: "root-delete@example.test",
        totpCode: totpCode(totpSecret)
      })).outcome
    ).toBe("forbidden-target");

    expect(
      (await deleteAdminAccountAsSuperAdmin(actor, tenant.owner.id, {
        confirmEmail: tenant.owner.email,
        totpCode: "000000"
      })).outcome
    ).toBe("step-up-failed");

    expect((await getPool().query(`SELECT 1 FROM platform_users WHERE id = $1`, [tenant.owner.id])).rowCount).toBe(1);
  });
});
