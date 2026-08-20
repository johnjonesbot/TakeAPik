import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closePool, getPool } from "@/lib/db";
import { setMailerForTesting, type MailMessage } from "@/lib/mailer";
import { provisionTenantAsSuperAdmin, type SuperAdminActor } from "@/services/platform-admin";
import { resetHelperState, truncateAll } from "./helpers";

class FakeMailer {
  sent: MailMessage[] = [];
  failNext = 0;
  async send(message: MailMessage) {
    if (this.failNext > 0) {
      this.failNext -= 1;
      throw new Error("smtp-unavailable");
    }
    this.sent.push(message);
    return { messageId: `fake-${this.sent.length}` };
  }
}

async function makeSuperAdmin(): Promise<SuperAdminActor> {
  const row = await getPool().query<{ id: string }>(
    `INSERT INTO platform_users (email, password_hash, display_name, is_super_admin)
     VALUES ('root-welcome@example.test', 'x', 'Root', true) RETURNING id`
  );
  return { kind: "super-admin", platformUserId: row.rows[0]!.id, sessionId: "test-session" };
}

describe("provisioning welcome email", () => {
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

  it("emails the new host their credentials and instructions immediately", async () => {
    const actor = await makeSuperAdmin();
    const result = await provisionTenantAsSuperAdmin(actor, {
      ownerEmail: "host@example.test",
      ownerDisplayName: "Nadia Norris",
      eventName: "Nadia's 30th",
      eventStartsAt: new Date(Date.now() + 30 * 86_400_000)
    });

    expect(result.welcomeEmailSent).toBe(true);
    expect(result.temporaryPassword).toBeDefined();
    expect(mailer.sent).toHaveLength(1);
    const mail = mailer.sent[0]!;
    expect(mail.to).toBe("host@example.test");
    expect(mail.text).toContain(`/a/${result.slug}/admin`);
    expect(mail.text).toContain(result.accessCode);
    expect(mail.text).toContain(result.temporaryPassword!);
    expect(mail.text).toContain("automatically receives an invitation");
    expect(mail.html).toContain(result.accessCode);
    expect(mail.html).toContain(result.temporaryPassword!);
  });

  it("provisioning survives a mail outage and reports the email as unsent", async () => {
    const actor = await makeSuperAdmin();
    mailer.failNext = 1;
    const result = await provisionTenantAsSuperAdmin(actor, {
      ownerEmail: "host2@example.test",
      ownerDisplayName: "Omar Osei",
      eventName: "Omar's Send-off",
      eventStartsAt: new Date(Date.now() + 30 * 86_400_000)
    });

    expect(result.welcomeEmailSent).toBe(false);
    expect(result.slug).toBeTruthy();
    const tenants = await getPool().query(`SELECT 1 FROM tenants WHERE id = $1`, [result.tenantId]);
    expect(tenants.rowCount).toBe(1);
  });
});
