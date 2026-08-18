import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { verifyAccessCode } from "@/lib/access-code";
import { closePool, getPool } from "@/lib/db";
import { provisionTestTenant, resetHelperState, truncateAll } from "./helpers";

describe("tenant provisioning", () => {
  beforeEach(async () => {
    await truncateAll();
    resetHelperState();
  });

  afterAll(async () => {
    await closePool();
  });

  it("creates tenant, event, admin membership, access code, and audit trail", async () => {
    const result = await provisionTestTenant({ ownerDisplayName: "John Jones", eventName: "JJ Wedding" });

    expect(result.tenant.slug).toBe("jj");
    expect(result.tenant.status).toBe("active");
    expect(result.event.name).toBe("JJ Wedding");
    expect(result.ownerMembership.role).toBe("admin");

    expect(result.accessCode).toMatch(/^\d{8}$/);
    expect(result.event.access_code_hash).not.toContain(result.accessCode);
    await expect(verifyAccessCode(result.event.access_code_hash, result.accessCode)).resolves.toBe(true);
    await expect(verifyAccessCode(result.event.access_code_hash, "00000000")).resolves.toBe(false);

    const audit = await getPool().query(
      "SELECT action, target_id FROM audit_logs WHERE tenant_id = $1 AND action = 'tenant.provision'",
      [result.tenant.id]
    );
    expect(audit.rowCount).toBe(1);
  });

  it("produces unique slugs under concurrent provisioning with identical names", async () => {
    const results = await Promise.all(
      Array.from({ length: 6 }, () =>
        provisionTestTenant({
          ownerDisplayName: "John Jones",
          ownerEmail: `owner-${randomUUID()}@example.test`
        })
      )
    );

    const slugs = results.map((result) => result.tenant.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
    expect(slugs).toContain("jj");
    for (const slug of slugs) {
      expect(slug).toMatch(/^jj(\d+[a-z])?$/);
    }
  });

  it("rolls back the whole transaction when a step fails", async () => {
    const before = await getPool().query("SELECT count(*)::int AS count FROM tenants");
    await expect(
      provisionTestTenant({ actorPlatformUserId: randomUUID() }) // unknown actor violates audit FK
    ).rejects.toThrow();
    const after = await getPool().query("SELECT count(*)::int AS count FROM tenants");
    expect(after.rows[0]?.count).toBe(before.rows[0]?.count);
  });
});
