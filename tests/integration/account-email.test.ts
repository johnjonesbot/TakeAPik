import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closePool, getPool } from "@/lib/db";
import { hashPassword } from "@/lib/passwords";
import { changeAccountEmail } from "@/services/auth-admin";
import { findPlatformUserById } from "@/lib/repositories/platform-users";
import { provisionTestTenant, resetHelperState, truncateAll } from "./helpers";

describe("account email change", () => {
  beforeEach(async () => {
    await truncateAll();
    resetHelperState();
  });

  afterAll(async () => {
    await closePool();
  });

  it("changes the email with the correct password and audits it", async () => {
    const password = "admin-password-123";
    const tenant = await provisionTestTenant({ ownerPasswordHash: await hashPassword(password) });

    const result = await changeAccountEmail({
      platformUserId: tenant.owner.id,
      currentPassword: password,
      newEmail: "  New-Owner@Example.TEST "
    });
    expect(result).toBe("success");

    const user = await findPlatformUserById(getPool(), tenant.owner.id);
    expect(user?.email).toBe("new-owner@example.test");

    const audit = await getPool().query(
      `SELECT metadata FROM audit_logs WHERE action = 'member.update' AND target_id = $1`,
      [tenant.owner.id]
    );
    expect(audit.rows.some((row) => row.metadata?.change === "email")).toBe(true);
  });

  it("rejects a wrong password and a taken email", async () => {
    const password = "admin-password-123";
    const tenant = await provisionTestTenant({ ownerPasswordHash: await hashPassword(password) });
    const other = await provisionTestTenant({ ownerDisplayName: "Mary Major" });

    expect(
      await changeAccountEmail({
        platformUserId: tenant.owner.id,
        currentPassword: "wrong",
        newEmail: "x@example.test"
      })
    ).toBe("invalid-current");

    expect(
      await changeAccountEmail({
        platformUserId: tenant.owner.id,
        currentPassword: password,
        newEmail: other.owner.email
      })
    ).toBe("email-taken");

    const unchanged = await findPlatformUserById(getPool(), tenant.owner.id);
    expect(unchanged?.email).toBe(tenant.owner.email);
  });
});
