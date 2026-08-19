import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closePool, getPool } from "@/lib/db";
import { setMailerForTesting, type MailMessage } from "@/lib/mailer";
import { hashPassword } from "@/lib/passwords";
import { verifyAccessCode } from "@/lib/access-code";
import { findEventByTenant } from "@/lib/repositories/events";
import { setStorageForTesting } from "@/lib/storage";
import { resolveActorFromToken, issueSession } from "@/services/sessions";
import { acceptInvitation, resendInvitation, sendInvitations } from "@/services/invitations";
import { createFriend, disableFriend, importFriends, listFriends } from "@/services/friends";
import { rotateEventAccessCode, setCoverPhoto, updateEventSettings, type AdminActor } from "@/services/event-admin";
import type { RateLimiter } from "@/lib/rate-limit";
import { FakeStorage } from "./fake-storage";
import { provisionTestTenant, resetHelperState, truncateAll, type ProvisionedTenant } from "./helpers";

const noLimit: RateLimiter = { consume: async () => ({ allowed: true, remaining: 99 }) };

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

function adminActor(tenant: ProvisionedTenant): AdminActor {
  return {
    kind: "admin",
    tenantId: tenant.tenant.id,
    membershipId: tenant.ownerMembership.id,
    platformUserId: tenant.owner.id,
    sessionId: "test-session"
  };
}

describe("event administration", () => {
  let mailer: FakeMailer;

  beforeEach(async () => {
    await truncateAll();
    resetHelperState();
    mailer = new FakeMailer();
    setMailerForTesting(mailer);
    setStorageForTesting(new FakeStorage());
  });

  afterAll(async () => {
    setMailerForTesting(undefined);
    setStorageForTesting(undefined);
    await closePool();
  });

  it("updates event settings and audits the change", async () => {
    const tenant = await provisionTestTenant({ eventName: "Old Name" });
    const updated = await updateEventSettings(adminActor(tenant), { name: "New Name", timezone: "America/Managua" });
    expect(updated?.name).toBe("New Name");
    expect(updated?.timezone).toBe("America/Managua");
  });

  it("rotates the access code only with a correct step-up password", async () => {
    const password = "admin-password-123";
    const tenant = await provisionTestTenant({ ownerPasswordHash: await hashPassword(password) });
    const actor = adminActor(tenant);

    expect((await rotateEventAccessCode(actor, "wrong-password")).outcome).toBe("step-up-failed");

    const rotated = await rotateEventAccessCode(actor, password);
    expect(rotated.outcome).toBe("rotated");
    if (rotated.outcome !== "rotated") return;
    expect(rotated.accessCode).toMatch(/^\d{8}$/);

    const event = await findEventByTenant(getPool(), tenant.tenant.id);
    await expect(verifyAccessCode(event!.access_code_hash, rotated.accessCode)).resolves.toBe(true);
    await expect(verifyAccessCode(event!.access_code_hash, tenant.accessCode)).resolves.toBe(false);
  });

  it("enforces normalized-email uniqueness per tenant and supports import", async () => {
    const tenant = await provisionTestTenant();
    const actor = adminActor(tenant);

    const created = await createFriend(actor, { email: "  Guest@Example.TEST ", name: "Guest One" });
    expect(created.outcome).toBe("created");
    const duplicate = await createFriend(actor, { email: "guest@example.test", name: "Guest Again" });
    expect(duplicate.outcome).toBe("duplicate-email");

    const imported = await importFriends(actor, [
      { email: "guest@example.test", name: "Dup" },
      { email: "second@example.test", name: "Second" }
    ]);
    expect(imported.created).toHaveLength(1);
    expect(imported.duplicates).toEqual(["guest@example.test"]);

    // The same email is fine in a different tenant.
    const other = await provisionTestTenant({ ownerDisplayName: "Mary Major" });
    const cross = await createFriend(adminActor(other), { email: "guest@example.test", name: "Guest" });
    expect(cross.outcome).toBe("created");
  });

  it("disabling a friend revokes their sessions immediately", async () => {
    const tenant = await provisionTestTenant();
    const actor = adminActor(tenant);
    const created = await createFriend(actor, { email: "guest@example.test", name: "Guest" });
    if (created.outcome !== "created") throw new Error("setup failed");

    const session = await issueSession(getPool(), {
      tenantId: tenant.tenant.id,
      membershipId: created.friend.id
    });
    expect(await resolveActorFromToken(session.token)).not.toBeNull();

    expect(await disableFriend(actor, created.friend.id)).toBe("disabled");
    expect(await resolveActorFromToken(session.token)).toBeNull();
    expect(await disableFriend(actor, actor.membershipId)).toBe("cannot-disable-self");
  });

  it("send-all emails every unsent friend once and replays idempotently", async () => {
    const tenant = await provisionTestTenant({ eventName: "Maya & Leo" });
    const actor = adminActor(tenant);
    await createFriend(actor, { email: "one@example.test", name: "One" });
    await createFriend(actor, { email: "two@example.test", name: "Two" });

    const first = await sendInvitations(actor, tenant.tenant.slug, { idempotencyKey: "key-1234567" }, noLimit);
    expect(first.outcome).toBe("sent");
    if (first.outcome !== "sent") return;
    expect(first.invitations.filter((invitation) => invitation.status === "sent")).toHaveLength(2);
    expect(mailer.sent).toHaveLength(2);
    expect(mailer.sent[0]?.text).toContain("/invite?token=");
    expect(mailer.sent[0]?.text).not.toMatch(/\b\d{8}\b/); // never the access code

    const replay = await sendInvitations(actor, tenant.tenant.slug, { idempotencyKey: "key-1234567" }, noLimit);
    expect(replay.outcome === "sent" && replay.replayed).toBe(true);
    expect(mailer.sent).toHaveLength(2);

    // A later send-all with a fresh key finds nothing unsent.
    const again = await sendInvitations(actor, tenant.tenant.slug, { idempotencyKey: "key-7654321" }, noLimit);
    expect(again.outcome === "sent" && again.invitations).toHaveLength(0);
    expect(mailer.sent).toHaveLength(2);
  });

  it("records failures with bounded retries and supports resend", async () => {
    const tenant = await provisionTestTenant();
    const actor = adminActor(tenant);
    const created = await createFriend(actor, { email: "flaky@example.test", name: "Flaky" });
    if (created.outcome !== "created") throw new Error("setup failed");

    mailer.failNext = 1;
    const first = await sendInvitations(actor, tenant.tenant.slug, { idempotencyKey: "key-fail-001" }, noLimit);
    if (first.outcome !== "sent") throw new Error("send failed");
    const failed = first.invitations[0];
    expect(failed?.status).toBe("failed");
    expect(failed?.failureReason).toBe("smtp-unavailable");

    const resent = await resendInvitation(actor, tenant.tenant.slug, failed!.id);
    expect(resent.outcome).toBe("sent");
    expect(mailer.sent).toHaveLength(1);

    // Retry cap: exhaust attempts, then the resend is refused.
    await getPool().query("UPDATE invitations SET attempts = 3, status = 'failed' WHERE id = $1", [failed!.id]);
    const capped = await resendInvitation(actor, tenant.tenant.slug, failed!.id);
    expect(capped.outcome).toBe("attempts-exhausted");
  });

  it("invite links resolve on the right tenant only and never expose the code", async () => {
    const tenant = await provisionTestTenant({ eventName: "Maya & Leo" });
    const actor = adminActor(tenant);
    await createFriend(actor, { email: "guest@example.test", name: "Guest" });
    const sent = await sendInvitations(actor, tenant.tenant.slug, { idempotencyKey: "key-link-001" }, noLimit);
    if (sent.outcome !== "sent") throw new Error("send failed");

    const url = new URL(mailer.sent[0]!.text.match(/https?:\/\/\S+/)![0]);
    const token = url.searchParams.get("token")!;
    // Path-based album on the single origin (ADR-005).
    expect(url.hostname).toBe("takeapik.test");
    expect(url.pathname).toBe(`/a/${tenant.tenant.slug}/invite`);

    const other = await provisionTestTenant({ ownerDisplayName: "Mary Major" });
    expect(await acceptInvitation(token, other.tenant.id)).toBeNull();

    const accepted = await acceptInvitation(token, tenant.tenant.id);
    expect(accepted).toEqual({ membershipEmail: "guest@example.test", eventName: "Maya & Leo" });
  });

  it("cover photo must be a ready photo of the same tenant", async () => {
    const tenant = await provisionTestTenant();
    const other = await provisionTestTenant({ ownerDisplayName: "Mary Major" });
    const actor = adminActor(tenant);

    // Insert a ready photo directly for each tenant.
    const insert = async (tenantId: string, membershipId: string, key: string) =>
      (
        await getPool().query<{ id: string }>(
          `INSERT INTO photos (tenant_id, uploaded_by_membership_id, object_key, original_filename, mime_type, byte_size, width, height, checksum_sha256, status, ready_at)
           VALUES ($1, $2, $3, 'a.jpg', 'image/jpeg', 1000, 100, 100, repeat('a', 64), 'ready', now())
           RETURNING id`,
          [tenantId, membershipId, key]
        )
      ).rows[0]!.id;

    const own = await insert(tenant.tenant.id, tenant.ownerMembership.id, "k1");
    const foreign = await insert(other.tenant.id, other.ownerMembership.id, "k2");

    expect(await setCoverPhoto(actor, foreign)).toBe("not-found");
    expect(await setCoverPhoto(actor, own)).toBe("set");

    const event = await findEventByTenant(getPool(), tenant.tenant.id);
    expect(event?.cover_photo_id).toBe(own);
  });
});
