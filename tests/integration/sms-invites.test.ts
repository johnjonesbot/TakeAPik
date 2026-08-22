import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closePool, getPool } from "@/lib/db";
import { setMailerForTesting, type MailMessage } from "@/lib/mailer";
import { setSmsSenderForTesting, type SmsMessage } from "@/lib/sms";
import { setStorageForTesting } from "@/lib/storage";
import { createFriendAndInvite } from "@/services/friends";
import { loginFriend } from "@/services/auth-friend";
import type { AdminActor } from "@/services/event-admin";
import type { RateLimiter } from "@/lib/rate-limit";
import { FakeStorage } from "./fake-storage";
import { provisionTestTenant, resetHelperState, truncateAll, type ProvisionedTenant } from "./helpers";

const noLimit: RateLimiter = { consume: async () => ({ allowed: true, remaining: 99 }) };

class FakeMailer {
  sent: MailMessage[] = [];
  async send(m: MailMessage) {
    this.sent.push(m);
    return { messageId: `mail-${this.sent.length}` };
  }
}
class FakeSms {
  sent: SmsMessage[] = [];
  async send(m: SmsMessage) {
    this.sent.push(m);
    return { messageId: `sms-${this.sent.length}` };
  }
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

describe("SMS invitations and phone login", () => {
  let mailer: FakeMailer;
  let sms: FakeSms;

  beforeEach(async () => {
    await truncateAll();
    resetHelperState();
    mailer = new FakeMailer();
    sms = new FakeSms();
    setMailerForTesting(mailer);
    setSmsSenderForTesting(sms);
    setStorageForTesting(new FakeStorage());
  });

  afterAll(async () => {
    setMailerForTesting(undefined);
    setSmsSenderForTesting(undefined);
    setStorageForTesting(undefined);
    await closePool();
  });

  it("texts a phone-only guest with the link and access code", async () => {
    const tenant = await provisionTestTenant({ eventName: "Maya & Leo" });
    const result = await createFriendAndInvite(adminActor(tenant), {
      name: "Text Guest",
      phone: "(305) 555-0142"
    });
    expect(result.outcome).toBe("created");

    expect(sms.sent).toHaveLength(1);
    expect(mailer.sent).toHaveLength(0);
    expect(sms.sent[0]?.to).toBe("+13055550142");
    expect(sms.sent[0]?.text).toContain("/invite?token=");
    expect(sms.sent[0]?.text).toContain(tenant.accessCode);
  });

  it("prefers SMS over email when a guest has both", async () => {
    const tenant = await provisionTestTenant();
    await createFriendAndInvite(adminActor(tenant), {
      name: "Both Guest",
      email: "both@example.test",
      phone: "305-555-0143"
    });
    expect(sms.sent).toHaveLength(1);
    expect(mailer.sent).toHaveLength(0);
  });

  it("emails an email-only guest", async () => {
    const tenant = await provisionTestTenant();
    await createFriendAndInvite(adminActor(tenant), { name: "Mail Guest", email: "mail@example.test" });
    expect(mailer.sent).toHaveLength(1);
    expect(sms.sent).toHaveLength(0);
  });

  it("lets a phone-only guest log in by phone + code", async () => {
    const tenant = await provisionTestTenant();
    const created = await createFriendAndInvite(adminActor(tenant), {
      name: "Phone Login",
      phone: "+1 (305) 555-0199"
    });
    if (created.outcome !== "created") throw new Error("setup failed");

    const login = await loginFriend(
      {
        tenant: { tenantId: tenant.tenant.id, slug: tenant.tenant.slug, displayName: tenant.tenant.display_name },
        identifier: "3055550199",
        accessCode: tenant.accessCode
      },
      noLimit
    );
    expect(login.outcome).toBe("success");
  });

  it("rejects adding a guest with no contact", async () => {
    const tenant = await provisionTestTenant();
    const result = await createFriendAndInvite(adminActor(tenant), { name: "No Contact" });
    expect(result.outcome).toBe("invalid-contact");
  });
});
