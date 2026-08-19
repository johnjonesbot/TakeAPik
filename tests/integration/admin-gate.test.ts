import { NextRequest } from "next/server";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { requireAdminActor } from "@/lib/admin-route";
import { closePool, getPool } from "@/lib/db";
import { createMembership } from "@/lib/repositories/memberships";
import { issueSession } from "@/services/sessions";
import { provisionTestTenant, resetHelperState, truncateAll, type ProvisionedTenant } from "./helpers";

function adminRequest(sessionToken: string | null, extraHeaders: Record<string, string> = {}): NextRequest {
  const host = "albums.takeapik.test";
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
 * The admin surface is decided entirely by the session (ADR-004): the role and
 * tenant come from the session row in the database, never from the URL, path,
 * or any header a browser can set.
 */
describe("admin gate is server-enforced by session", () => {
  beforeEach(async () => {
    await truncateAll();
    resetHelperState();
  });

  afterAll(async () => {
    await closePool();
  });

  it("accepts a genuine admin session and returns its album slug", async () => {
    const tenant = await provisionTestTenant();
    const session = await issueSession(getPool(), {
      tenantId: tenant.tenant.id,
      membershipId: tenant.ownerMembership.id,
      platformUserId: tenant.owner.id
    });
    const gate = await requireAdminActor(adminRequest(session.token), "rid", { mutation: false });
    expect("actor" in gate && gate.actor.kind).toBe("admin");
    if ("actor" in gate) expect(gate.tenantSlug).toBe(tenant.tenant.slug);
  });

  it("rejects a friend session, even with forged admin role headers", async () => {
    const tenant = await provisionTestTenant();
    const token = await friendSession(tenant);
    const plain = await requireAdminActor(adminRequest(token), "rid", { mutation: false });
    expect("error" in plain).toBe(true);

    const spoofed = await requireAdminActor(
      adminRequest(token, { "x-role": "admin", "x-takeapik-role": "admin", "x-forwarded-user": tenant.owner.email }),
      "rid",
      { mutation: false }
    );
    expect("error" in spoofed).toBe(true);
  });

  it("rejects missing and forged session cookies", async () => {
    const anonymous = await requireAdminActor(adminRequest(null), "rid", { mutation: false });
    expect("error" in anonymous).toBe(true);
    const forged = await requireAdminActor(adminRequest("a".repeat(43)), "rid", { mutation: false });
    expect("error" in forged).toBe(true);
  });

  it("rejects a super-admin session on the album-admin gate", async () => {
    const superToken = (
      await issueSession(getPool(), {
        platformUserId: (
          await getPool().query<{ id: string }>(
            "INSERT INTO platform_users (email, password_hash, display_name, is_super_admin) VALUES ($1, 'x', 'Root', true) RETURNING id",
            [`root-${Date.now()}@example.test`]
          )
        ).rows[0]!.id
      })
    ).token;
    const gate = await requireAdminActor(adminRequest(superToken), "rid", { mutation: false });
    expect("error" in gate).toBe(true);
  });

  it("rejects cross-origin admin mutations even from a real admin session", async () => {
    const tenant = await provisionTestTenant();
    const session = await issueSession(getPool(), {
      tenantId: tenant.tenant.id,
      membershipId: tenant.ownerMembership.id,
      platformUserId: tenant.owner.id
    });
    const gate = await requireAdminActor(
      adminRequest(session.token, { origin: "https://evil.example", "sec-fetch-site": "cross-site" }),
      "rid",
      { mutation: true }
    );
    expect("error" in gate).toBe(true);
  });
});
