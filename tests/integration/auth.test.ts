import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closePool, getPool } from "@/lib/db";
import { hashPassword } from "@/lib/passwords";
import { openSecret } from "@/lib/secret-box";
import { totpCode } from "@/lib/totp";
import { hashToken } from "@/lib/tokens";
import type { RateLimiter } from "@/lib/rate-limit";
import { loginAdmin, changeAdminPassword, startMfaEnrollment, confirmMfaEnrollment } from "@/services/auth-admin";
import { loginFriend, locateFriendLogin } from "@/services/auth-friend";
import { consumeLoginHandoff } from "@/services/login-handoff";
import { issueSession, resolveActorFromToken } from "@/services/sessions";
import { toTenantContext } from "@/services/tenant-context";
import { provisionTestTenant, resetHelperState, truncateAll } from "./helpers";

const noLimit: RateLimiter = { consume: async () => ({ allowed: true, remaining: 99 }) };

describe("authentication", () => {
  beforeEach(async () => {
    await truncateAll();
    resetHelperState();
  });

  afterAll(async () => {
    await closePool();
  });

  it("friend login succeeds only when event name, email, and code all match the tenant", async () => {
    const tenant = await provisionTestTenant({ eventName: "Maya & Leo" });
    const context = toTenantContext(tenant.tenant);
    const email = tenant.owner.email;

    const ok = await loginFriend(
      { tenant: context, eventName: "  MAYA  &  LEO ", email, accessCode: tenant.accessCode },
      noLimit
    );
    expect(ok.outcome).toBe("success");

    const wrongName = await loginFriend(
      { tenant: context, eventName: "Other Party", email, accessCode: tenant.accessCode },
      noLimit
    );
    const wrongEmail = await loginFriend(
      { tenant: context, eventName: "Maya & Leo", email: "nobody@example.test", accessCode: tenant.accessCode },
      noLimit
    );
    const wrongCode = await loginFriend(
      { tenant: context, eventName: "Maya & Leo", email, accessCode: "00000001" },
      noLimit
    );
    expect([wrongName.outcome, wrongEmail.outcome, wrongCode.outcome]).toEqual(["failure", "failure", "failure"]);
  });

  it("friend login rejects a valid code presented against another tenant", async () => {
    const a = await provisionTestTenant({ eventName: "Event A" });
    const b = await provisionTestTenant({ ownerDisplayName: "Mary Major", eventName: "Event B" });

    const crossTenant = await loginFriend(
      {
        tenant: toTenantContext(b.tenant),
        eventName: "Event A",
        email: a.owner.email,
        accessCode: a.accessCode
      },
      noLimit
    );
    expect(crossTenant.outcome).toBe("failure");
  });

  it("root-domain locate issues a single-use handoff bound to the right tenant", async () => {
    const tenant = await provisionTestTenant({ eventName: "Maya & Leo" });

    const located = await locateFriendLogin(
      { eventName: "maya & leo", email: tenant.owner.email, accessCode: tenant.accessCode },
      noLimit
    );
    expect(located.outcome).toBe("success");
    if (located.outcome !== "success") return;
    expect(located.handoff.tenantSlug).toBe(tenant.tenant.slug);

    const other = await provisionTestTenant({ ownerDisplayName: "Mary Major" });
    expect(await consumeLoginHandoff(located.handoff.token, other.tenant.id)).toBeNull();

    const consumed = await consumeLoginHandoff(located.handoff.token, tenant.tenant.id);
    expect(consumed?.membershipId).toBe(tenant.ownerMembership.id);
    expect(await consumeLoginHandoff(located.handoff.token, tenant.tenant.id)).toBeNull();
  });

  it("sessions resolve to actors, expire server-side, and die when the membership is disabled", async () => {
    const tenant = await provisionTestTenant();
    const issued = await issueSession(getPool(), {
      tenantId: tenant.tenant.id,
      membershipId: tenant.ownerMembership.id
    });

    const actor = await resolveActorFromToken(issued.token);
    expect(actor?.kind).toBe("friend");

    await getPool().query("UPDATE sessions SET expires_at = now() - interval '1 second' WHERE token_hash = $1", [
      hashToken(issued.token)
    ]);
    expect(await resolveActorFromToken(issued.token)).toBeNull();

    const second = await issueSession(getPool(), {
      tenantId: tenant.tenant.id,
      membershipId: tenant.ownerMembership.id
    });
    await getPool().query("UPDATE memberships SET disabled_at = now() WHERE id = $1", [tenant.ownerMembership.id]);
    expect(await resolveActorFromToken(second.token)).toBeNull();
  });

  it("admin login requires the tenant admin membership and honors MFA when enrolled", async () => {
    const password = "correct-horse-battery";
    const passwordHash = await hashPassword(password);
    const tenant = await provisionTestTenant({ ownerPasswordHash: passwordHash });
    const context = toTenantContext(tenant.tenant);
    const email = tenant.owner.email;

    const ok = await loginAdmin({ tenant: context, email, password }, noLimit);
    expect(ok.outcome).toBe("success");
    if (ok.outcome === "success") {
      const actor = await resolveActorFromToken(ok.session.token);
      expect(actor?.kind).toBe("admin");
    }

    const wrongPassword = await loginAdmin({ tenant: context, email, password: "wrong-password!" }, noLimit);
    expect(wrongPassword.outcome).toBe("failure");

    const other = await provisionTestTenant({ ownerDisplayName: "Mary Major" });
    const wrongTenant = await loginAdmin({ tenant: toTenantContext(other.tenant), email, password }, noLimit);
    expect(wrongTenant.outcome).toBe("failure");

    const enrollment = await startMfaEnrollment(tenant.owner.id);
    expect(enrollment).not.toBeNull();
    if (!enrollment) return;
    expect(await confirmMfaEnrollment(tenant.owner.id, totpCode(enrollment.secret))).toBe(true);

    const withoutCode = await loginAdmin({ tenant: context, email, password }, noLimit);
    expect(withoutCode.outcome).toBe("mfa-required");
    const withCode = await loginAdmin(
      { tenant: context, email, password, totpCode: totpCode(enrollment.secret) },
      noLimit
    );
    expect(withCode.outcome).toBe("success");
  });

  it("super-admin login demands the super-admin flag and enrolled MFA", async () => {
    const password = "platform-password-1";
    const passwordHash = await hashPassword(password);
    const email = `root-${randomUUID()}@example.test`;
    await getPool().query(
      "INSERT INTO platform_users (email, password_hash, display_name, is_super_admin) VALUES ($1, $2, 'Root', true)",
      [email, passwordHash]
    );

    // MFA not enrolled yet: login is refused outright.
    const beforeMfa = await loginAdmin({ email, password }, noLimit);
    expect(beforeMfa.outcome).toBe("failure");

    const user = await getPool().query<{ id: string }>("SELECT id FROM platform_users WHERE email = $1", [email]);
    const userId = user.rows[0]!.id;
    const enrollment = await startMfaEnrollment(userId);
    if (!enrollment) throw new Error("enrollment failed");
    await confirmMfaEnrollment(userId, totpCode(enrollment.secret));

    const withCode = await loginAdmin({ email, password, totpCode: totpCode(enrollment.secret) }, noLimit);
    expect(withCode.outcome).toBe("success");
    if (withCode.outcome === "success") {
      const actor = await resolveActorFromToken(withCode.session.token);
      expect(actor?.kind).toBe("super-admin");
    }

    // A regular (non-super) account cannot use the root portal at all.
    const tenant = await provisionTestTenant({ ownerPasswordHash: passwordHash });
    const regular = await loginAdmin({ email: tenant.owner.email, password }, noLimit);
    expect(regular.outcome).toBe("failure");
  });

  it("password change verifies the current password and revokes other sessions", async () => {
    const password = "original-password-1";
    const tenant = await provisionTestTenant({ ownerPasswordHash: await hashPassword(password) });
    const context = toTenantContext(tenant.tenant);

    const first = await loginAdmin({ tenant: context, email: tenant.owner.email, password }, noLimit);
    const second = await loginAdmin({ tenant: context, email: tenant.owner.email, password }, noLimit);
    if (first.outcome !== "success" || second.outcome !== "success") throw new Error("setup login failed");

    const rejected = await changeAdminPassword({
      platformUserId: tenant.owner.id,
      currentPassword: "not-the-password",
      newPassword: "brand-new-password-1",
      currentSessionId: first.session.session.id
    });
    expect(rejected).toBe("invalid-current");

    const changed = await changeAdminPassword({
      platformUserId: tenant.owner.id,
      currentPassword: password,
      newPassword: "brand-new-password-1",
      currentSessionId: first.session.session.id
    });
    expect(changed).toBe("success");

    expect(await resolveActorFromToken(first.session.token)).not.toBeNull();
    expect(await resolveActorFromToken(second.session.token)).toBeNull();

    const withNew = await loginAdmin(
      { tenant: context, email: tenant.owner.email, password: "brand-new-password-1" },
      noLimit
    );
    expect(withNew.outcome).toBe("success");
  });

  it("rate limiting blocks the sixth attempt in a window", async () => {
    const tenant = await provisionTestTenant();
    const context = toTenantContext(tenant.tenant);
    const attempt = () =>
      loginFriend({
        tenant: context,
        eventName: "Wrong",
        email: "nobody@example.test",
        accessCode: "00000000",
        ipHash: "fixed-ip-hash"
      });

    for (let i = 0; i < 5; i += 1) {
      expect((await attempt()).outcome).toBe("failure");
    }
    expect((await attempt()).outcome).toBe("rate-limited");
  });

  it("stores TOTP secrets only in sealed form", async () => {
    const tenant = await provisionTestTenant();
    const enrollment = await startMfaEnrollment(tenant.owner.id);
    if (!enrollment) throw new Error("enrollment failed");

    const row = await getPool().query<{ mfa_totp_secret_encrypted: string }>(
      "SELECT mfa_totp_secret_encrypted FROM platform_users WHERE id = $1",
      [tenant.owner.id]
    );
    const sealed = row.rows[0]!.mfa_totp_secret_encrypted;
    expect(sealed).not.toContain(enrollment.secret);
    expect(openSecret(sealed, "totp")).toBe(enrollment.secret);
  });
});
