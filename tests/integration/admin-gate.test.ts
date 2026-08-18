import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { requireAdminActor } from "@/lib/admin-route";
import { closePool, getPool } from "@/lib/db";
import { createMembership } from "@/lib/repositories/memberships";
import { issueSession } from "@/services/sessions";
import { provisionTestTenant, resetHelperState, truncateAll, type ProvisionedTenant } from "./helpers";

function adminRequest(tenantSlug: string, sessionToken: string | null, extraHeaders: Record<string, string> = {}): NextRequest {
  const host = `${tenantSlug}.takeapik.test`;
  return new NextRequest(`http://${host}/api/v1/admin/event`, {
    headers: {
      host,
      ...(sessionToken ? { cookie: `takeapik_session=${sessionToken}` } : {}),
      ...extraHeaders
    }
  });
}

async function friendSession(tenant: ProvisionedTenant): Promise<string> {
  const friend = await createMembership(getPool(), {
    tenantId: tenant.tenant.id,
    email: `friend-${Date.now()}@example.test`,
    friendName: "Just A Friend"
  });
  const session = await issueSession(getPool(), { tenantId: tenant.tenant.id, membershipId: friend.id });
  return session.token;
}

/**
 * The Settings tab in the UI is cosmetic; this suite proves the server-side
 * gate is what actually decides. A friend session must never pass the admin
 * gate, no matter what headers or paths the browser sends.
 */
describe("admin gate is server-enforced", () => {
  beforeEach(async () => {
    await truncateAll();
    resetHelperState();
  });

  afterAll(async () => {
    await closePool();
  });

  it("accepts a genuine admin session", async () => {
    const tenant = await provisionTestTenant();
    const session = await issueSession(getPool(), {
      tenantId: tenant.tenant.id,
      membershipId: tenant.ownerMembership.id,
      platformUserId: tenant.owner.id
    });
    const gate = await requireAdminActor(adminRequest(tenant.tenant.slug, session.token), "rid", { mutation: false });
    expect("actor" in gate && gate.actor.kind).toBe("admin");
  });

  it("rejects a friend session outright", async () => {
    const tenant = await provisionTestTenant();
    const token = await friendSession(tenant);
    const gate = await requireAdminActor(adminRequest(tenant.tenant.slug, token), "rid", { mutation: false });
    expect("error" in gate).toBe(true);
  });

  it("rejects a friend session even with spoofed tenant/admin headers", async () => {
    const tenant = await provisionTestTenant();
    const token = await friendSession(tenant);
    const gate = await requireAdminActor(
      adminRequest(tenant.tenant.slug, token, {
        "x-takeapik-tenant": tenant.tenant.slug,
        "x-role": "admin",
        "x-forwarded-user": tenant.owner.email
      }),
      "rid",
      { mutation: false }
    );
    expect("error" in gate).toBe(true);
  });

  it("rejects an admin session replayed against a different tenant's host", async () => {
    const a = await provisionTestTenant();
    const b = await provisionTestTenant({ ownerDisplayName: "Mary Major" });
    const session = await issueSession(getPool(), {
      tenantId: a.tenant.id,
      membershipId: a.ownerMembership.id,
      platformUserId: a.owner.id
    });
    const gate = await requireAdminActor(adminRequest(b.tenant.slug, session.token), "rid", { mutation: false });
    expect("error" in gate).toBe(true);
  });

  it("rejects missing and forged session cookies", async () => {
    const tenant = await provisionTestTenant();
    const anonymous = await requireAdminActor(adminRequest(tenant.tenant.slug, null), "rid", { mutation: false });
    expect("error" in anonymous).toBe(true);
    const forged = await requireAdminActor(
      adminRequest(tenant.tenant.slug, "a".repeat(43)),
      "rid",
      { mutation: false }
    );
    expect("error" in forged).toBe(true);
  });

  it("rejects cross-origin admin mutations even from a real admin session", async () => {
    const tenant = await provisionTestTenant();
    const session = await issueSession(getPool(), {
      tenantId: tenant.tenant.id,
      membershipId: tenant.ownerMembership.id,
      platformUserId: tenant.owner.id
    });
    const gate = await requireAdminActor(
      adminRequest(tenant.tenant.slug, session.token, { origin: "https://evil.example", "sec-fetch-site": "cross-site" }),
      "rid",
      { mutation: true }
    );
    expect("error" in gate).toBe(true);
  });
});
