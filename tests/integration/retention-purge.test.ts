import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closePool, getPool } from "@/lib/db";
import type { RateLimiter } from "@/lib/rate-limit";
import { sealSecret } from "@/lib/secret-box";
import { generateTotpSecret, totpCode } from "@/lib/totp";
import { setStorageForTesting } from "@/lib/storage";
import { createUploadIntent } from "@/services/uploads";
import {
  listAdminAccounts,
  purgeAlbumContentAsSuperAdmin,
  type SuperAdminActor
} from "@/services/platform-admin";
import { FakeStorage } from "./fake-storage";
import { provisionTestTenant, resetHelperState, truncateAll, type ProvisionedTenant } from "./helpers";

const noLimit: RateLimiter = { consume: async () => ({ allowed: true, remaining: 99 }) };
const DAY = 86_400_000;

async function makeSuperAdmin(): Promise<{ actor: SuperAdminActor; totpSecret: string }> {
  const totpSecret = generateTotpSecret();
  const row = await getPool().query<{ id: string }>(
    `INSERT INTO platform_users (email, password_hash, display_name, is_super_admin, mfa_totp_secret_encrypted, mfa_enabled_at)
     VALUES ('root-purge@example.test', 'x', 'Root', true, $1, now()) RETURNING id`,
    [sealSecret(totpSecret, "totp")]
  );
  return {
    actor: { kind: "super-admin", platformUserId: row.rows[0]!.id, sessionId: "test-session" },
    totpSecret
  };
}

function intentInput(tenant: ProvisionedTenant) {
  return {
    tenantId: tenant.tenant.id,
    membershipId: tenant.ownerMembership.id,
    filename: "a.jpg",
    mimeType: "image/jpeg",
    byteSize: 1000,
    width: 100,
    height: 100,
    checksumSha256: "a".repeat(64)
  };
}

async function setEventDate(tenantId: string, date: Date | null): Promise<void> {
  await getPool().query(`UPDATE events SET starts_at = $2 WHERE tenant_id = $1`, [tenantId, date]);
}

describe("retention window and album purge (ADR-007)", () => {
  let storage: FakeStorage;

  beforeEach(async () => {
    await truncateAll();
    resetHelperState();
    storage = new FakeStorage();
    setStorageForTesting(storage);
  });

  afterAll(async () => {
    setStorageForTesting(undefined);
    await closePool();
  });

  it("blocks uploads outside the event window and without an event date", async () => {
    const tenant = await provisionTestTenant();

    await setEventDate(tenant.tenant.id, null);
    const noDate = await createUploadIntent(intentInput(tenant), noLimit);
    expect(noDate).toMatchObject({ outcome: "invalid", reason: "event-date-not-set" });

    await setEventDate(tenant.tenant.id, new Date(Date.now() + 30 * DAY));
    const tooEarly = await createUploadIntent(intentInput(tenant), noLimit);
    expect(tooEarly).toMatchObject({ outcome: "invalid", reason: "uploads-not-open" });

    await setEventDate(tenant.tenant.id, new Date(Date.now() + 2 * DAY));
    const open = await createUploadIntent(intentInput(tenant), noLimit);
    expect(open.outcome).toBe("created");

    await setEventDate(tenant.tenant.id, new Date(Date.now() - 100 * DAY));
    const closed = await createUploadIntent(intentInput(tenant), noLimit);
    expect(closed).toMatchObject({ outcome: "invalid", reason: "uploads-closed" });
  });

  it("purges album content and storage but keeps the tenant, event, and owner", async () => {
    const { actor, totpSecret } = await makeSuperAdmin();
    const tenant = await provisionTestTenant();
    await setEventDate(tenant.tenant.id, new Date(Date.now() + 2 * DAY));

    const intent = await createUploadIntent(intentInput(tenant), noLimit);
    expect(intent.outcome).toBe("created");
    if (intent.outcome !== "created") return;
    storage.put(intent.photo.object_key, Buffer.from("jpeg-bytes"));

    const wrongCode = await purgeAlbumContentAsSuperAdmin(actor, tenant.tenant.id, { totpCode: "000000" });
    expect(wrongCode.outcome).toBe("step-up-failed");

    const purged = await purgeAlbumContentAsSuperAdmin(actor, tenant.tenant.id, {
      totpCode: totpCode(totpSecret)
    });
    expect(purged).toMatchObject({ outcome: "purged", deletedPhotos: 1, deletedObjects: 1 });

    const db = getPool();
    const photos = await db.query(`SELECT 1 FROM photos WHERE tenant_id = $1`, [tenant.tenant.id]);
    expect(photos.rowCount).toBe(0);
    expect(storage.objects.has(intent.photo.object_key)).toBe(false);

    const tenantRow = await db.query(`SELECT status FROM tenants WHERE id = $1`, [tenant.tenant.id]);
    expect(tenantRow.rows[0]?.status).toBe("active");
    const eventRow = await db.query(`SELECT starts_at, cover_photo_id FROM events WHERE tenant_id = $1`, [
      tenant.tenant.id
    ]);
    expect(eventRow.rows[0]?.starts_at).toBeNull();
    expect(eventRow.rows[0]?.cover_photo_id).toBeNull();
    const members = await db.query(`SELECT platform_user_id FROM memberships WHERE tenant_id = $1`, [
      tenant.tenant.id
    ]);
    expect(members.rowCount).toBe(1);
    expect(members.rows[0]?.platform_user_id).toBe(tenant.owner.id);

    const audit = await db.query(`SELECT 1 FROM audit_logs WHERE action = 'album.purge' AND tenant_id = $1`, [
      tenant.tenant.id
    ]);
    expect(audit.rowCount).toBe(1);
  });

  it("lists admin accounts with the takedown flag only when content remains", async () => {
    const { actor, totpSecret } = await makeSuperAdmin();
    const tenant = await provisionTestTenant();
    await setEventDate(tenant.tenant.id, new Date(Date.now() + 2 * DAY));
    const intent = await createUploadIntent(intentInput(tenant), noLimit);
    expect(intent.outcome).toBe("created");

    // Window long past → flagged while photos remain.
    await setEventDate(tenant.tenant.id, new Date(Date.now() - 100 * DAY));
    const flagged = await listAdminAccounts();
    const entry = flagged.find((account) => account.userId === tenant.owner.id);
    expect(entry?.tenant?.flagged).toBe(true);

    // After the purge the flag clears (no content to take down).
    await purgeAlbumContentAsSuperAdmin(actor, tenant.tenant.id, { totpCode: totpCode(totpSecret) });
    const after = await listAdminAccounts();
    expect(after.find((account) => account.userId === tenant.owner.id)?.tenant?.flagged).toBe(false);
  });
});
