import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closePool, getPool } from "@/lib/db";
import { findEventByTenant } from "@/lib/repositories/events";
import { disableMembership, findMembershipById, listMemberships } from "@/lib/repositories/memberships";
import { archiveTenant } from "@/lib/repositories/tenants";
import { lookupTenantByHost } from "@/services/tenant-context";
import { provisionTestTenant, resetHelperState, truncateAll } from "./helpers";

describe("tenant isolation", () => {
  beforeEach(async () => {
    await truncateAll();
    resetHelperState();
  });

  afterAll(async () => {
    await closePool();
  });

  it("does not return another tenant's membership even with a valid global ID", async () => {
    const a = await provisionTestTenant();
    const b = await provisionTestTenant({ ownerDisplayName: "Mary Major" });

    const crossTenantRead = await findMembershipById(getPool(), a.tenant.id, b.ownerMembership.id);
    expect(crossTenantRead).toBeNull();

    const sameTenantRead = await findMembershipById(getPool(), b.tenant.id, b.ownerMembership.id);
    expect(sameTenantRead?.id).toBe(b.ownerMembership.id);
  });

  it("does not mutate another tenant's membership", async () => {
    const a = await provisionTestTenant();
    const b = await provisionTestTenant({ ownerDisplayName: "Mary Major" });

    const crossTenantDisable = await disableMembership(getPool(), a.tenant.id, b.ownerMembership.id);
    expect(crossTenantDisable).toBeNull();

    const untouched = await findMembershipById(getPool(), b.tenant.id, b.ownerMembership.id);
    expect(untouched?.disabled_at).toBeNull();
  });

  it("scopes membership listing and event lookup by tenant", async () => {
    const a = await provisionTestTenant();
    const b = await provisionTestTenant({ ownerDisplayName: "Mary Major" });

    const aMembers = await listMemberships(getPool(), a.tenant.id);
    expect(aMembers).toHaveLength(1);
    expect(aMembers[0]?.tenant_id).toBe(a.tenant.id);

    const aEvent = await findEventByTenant(getPool(), a.tenant.id);
    expect(aEvent?.id).toBe(a.event.id);
    expect(aEvent?.id).not.toBe(b.event.id);
  });

  it("resolves hosts to active tenants and hides archived or unknown ones identically", async () => {
    const a = await provisionTestTenant();

    const active = await lookupTenantByHost(`${a.tenant.slug}.takeapik.test`);
    expect(active.kind).toBe("tenant");
    if (active.kind === "tenant") expect(active.context.tenantId).toBe(a.tenant.id);

    await archiveTenant(getPool(), a.tenant.id);
    const archived = await lookupTenantByHost(`${a.tenant.slug}.takeapik.test`);
    const missing = await lookupTenantByHost("no-such-album.takeapik.test");
    expect(archived).toEqual({ kind: "unavailable" });
    expect(missing).toEqual({ kind: "unavailable" });

    const root = await lookupTenantByHost("takeapik.test");
    expect(root).toEqual({ kind: "root" });
  });
});
