import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closePool, getPool } from "@/lib/db";
import { setMailerForTesting, type MailMessage } from "@/lib/mailer";
import type { RateLimiter } from "@/lib/rate-limit";
import { sealSecret } from "@/lib/secret-box";
import { generateTotpSecret, totpCode } from "@/lib/totp";
import { loginAdmin } from "@/services/auth-admin";
import { resetOwnerPasswordAsSuperAdmin, type SuperAdminActor } from "@/services/platform-admin";
import { issueSession, resolveActorFromToken } from "@/services/sessions";
import { lookupTenantBySlug } from "@/services/tenant-context";
import { provisionTestTenant, resetHelperState, truncateAll } from "./helpers";

const noLimit: RateLimiter = { consume: async () => ({ allowed: true, remaining: 99 }) };

async function makeSuperAdmin(): Promise<{ actor: SuperAdminActor; totpSecret: string }> {
  const totpSecret = generateTotpSecret();
  const row = await getPool().query<{ id: string }>(
    `INSERT INTO platform_users (email, password_hash, display_name, is_super_admin, mfa_totp_secret_encrypted, mfa_enabled_at)
     VALUES ('root-reset@example.test', 'x', 'Root', true, $1, now()) RETURNING id`,
    [sealSecret(totpSecret, "totp")]
  );
  return {
    actor: { kind: "super-admin", platformUserId: row.rows[0]!.id, sessionId: "test-session" },
    totpSecret
  };
}

class FakeMailer {
  sent: MailMessage[] = [];
  async send(message: MailMessage) {
    this.sent.push(message);
    return { messageId: `fake-${this.sent.length}` };
  }
}

describe("super-admin owner password reset", () => {
  let mailer: FakeMailer;

  beforeEach(async () => {
    await truncateAll();
    resetHelperState();
    mailer = new FakeMailer();
    setMailerForTesting(mailer);
  });

  afterAll(async () => {
    setMailerForTesting(undefined);
    await closePool();
  });

  it("resets the owner password, returns it once, and the owner can log in with it", async () => {
    const { actor, totpSecret } = await makeSuperAdmin();
    const provisioned = await provisionTestTenant();

    const result = await resetOwnerPasswordAsSuperAdmin(actor, provisioned.tenant.id, {
      totpCode: totpCode(totpSecret)
    });
    expect(result).toMatchObject({ outcome: "reset", emailSent: true });
    if (result.outcome !== "reset") return;
    expect(result.temporaryPassword.length).toBeGreaterThanOrEqual(12);

    // The owner is emailed their new credentials immediately.
    const resetMail = mailer.sent.find((mail) => mail.subject.includes("password was reset"));
    expect(resetMail?.to).toBe(provisioned.owner.email);
    expect(resetMail?.text).toContain(result.temporaryPassword);
    expect(resetMail?.text).toContain(`/a/${provisioned.tenant.slug}/admin`);

    const lookup = await lookupTenantBySlug(provisioned.tenant.slug);
    expect(lookup.kind).toBe("tenant");
    if (lookup.kind !== "tenant") return;
    const login = await loginAdmin(
      { tenant: lookup.context, email: provisioned.owner.email, password: result.temporaryPassword },
      noLimit
    );
    expect(login.outcome).toBe("success");

    const audit = await getPool().query(
      `SELECT * FROM audit_logs WHERE action = 'owner.password_reset' AND tenant_id = $1`,
      [provisioned.tenant.id]
    );
    expect(audit.rowCount).toBe(1);
  });

  it("revokes the owner's existing sessions", async () => {
    const { actor, totpSecret } = await makeSuperAdmin();
    const provisioned = await provisionTestTenant();
    const issued = await issueSession(getPool(), {
      tenantId: provisioned.tenant.id,
      membershipId: provisioned.ownerMembership.id,
      platformUserId: provisioned.owner.id
    });
    expect(await resolveActorFromToken(issued.token)).not.toBeNull();

    const result = await resetOwnerPasswordAsSuperAdmin(actor, provisioned.tenant.id, {
      totpCode: totpCode(totpSecret)
    });
    expect(result.outcome).toBe("reset");
    expect(await resolveActorFromToken(issued.token)).toBeNull();
  });

  it("fails step-up with a wrong TOTP code and leaves the password untouched", async () => {
    const { actor } = await makeSuperAdmin();
    const provisioned = await provisionTestTenant();

    const result = await resetOwnerPasswordAsSuperAdmin(actor, provisioned.tenant.id, {
      totpCode: "000000"
    });
    expect(result.outcome).toBe("step-up-failed");

    const audit = await getPool().query(`SELECT * FROM audit_logs WHERE action = 'owner.password_reset'`);
    expect(audit.rowCount).toBe(0);
  });

  it("refuses to reset another super-admin's password", async () => {
    const { actor, totpSecret } = await makeSuperAdmin();
    const provisioned = await provisionTestTenant();
    await getPool().query(`UPDATE platform_users SET is_super_admin = true WHERE id = $1`, [
      provisioned.owner.id
    ]);

    const result = await resetOwnerPasswordAsSuperAdmin(actor, provisioned.tenant.id, {
      totpCode: totpCode(totpSecret)
    });
    expect(result.outcome).toBe("forbidden-target");
  });

  it("returns not-found for unknown and archived tenants", async () => {
    const { actor, totpSecret } = await makeSuperAdmin();
    const provisioned = await provisionTestTenant();
    await getPool().query(`UPDATE tenants SET status = 'archived', archived_at = now() WHERE id = $1`, [
      provisioned.tenant.id
    ]);

    expect(
      (await resetOwnerPasswordAsSuperAdmin(actor, "3f6f6f6f-1111-2222-3333-444444444444", {
        totpCode: totpCode(totpSecret)
      })).outcome
    ).toBe("not-found");
    expect(
      (await resetOwnerPasswordAsSuperAdmin(actor, provisioned.tenant.id, {
        totpCode: totpCode(totpSecret)
      })).outcome
    ).toBe("not-found");
  });
});
