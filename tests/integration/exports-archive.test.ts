import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closePool, getPool } from "@/lib/db";
import type { RateLimiter } from "@/lib/rate-limit";
import { sealSecret } from "@/lib/secret-box";
import { generateTotpSecret, totpCode } from "@/lib/totp";
import { setStorageForTesting } from "@/lib/storage";
import { getExport, requestExport, runAlbumExportJob, deleteExpiredExports } from "@/services/exports";
import { enqueueJob, runJobsOnce, type JobRow } from "@/services/jobs";
import type { SuperAdminActor } from "@/services/platform-admin";
import { lookupTenantBySlug } from "@/services/tenant-context";
import { issueSession, resolveActorFromToken } from "@/services/sessions";
import type { AdminActor } from "@/services/event-admin";
import { FakeStorage } from "./fake-storage";
import { provisionTestTenant, resetHelperState, truncateAll, type ProvisionedTenant } from "./helpers";

const noLimit: RateLimiter = { consume: async () => ({ allowed: true, remaining: 99 }) };

function adminActor(tenant: ProvisionedTenant): AdminActor {
  return {
    kind: "admin",
    tenantId: tenant.tenant.id,
    membershipId: tenant.ownerMembership.id,
    platformUserId: tenant.owner.id,
    sessionId: "test-session"
  };
}

async function makeSuperAdmin(): Promise<{ actor: SuperAdminActor; totpSecret: string }> {
  const totpSecret = generateTotpSecret();
  const row = await getPool().query<{ id: string }>(
    `INSERT INTO platform_users (email, password_hash, display_name, is_super_admin, mfa_totp_secret_encrypted, mfa_enabled_at)
     VALUES ('root@example.test', 'x', 'Root', true, $1, now()) RETURNING id`,
    [sealSecret(totpSecret, "totp")]
  );
  return {
    actor: { kind: "super-admin", platformUserId: row.rows[0]!.id, sessionId: "test-session" },
    totpSecret
  };
}

async function insertReadyPhoto(storage: FakeStorage, tenant: ProvisionedTenant, index: number): Promise<void> {
  const key = `tenants/${tenant.tenant.id}/photos/photo-${index}.jpg`;
  storage.put(key, Buffer.from(`jpeg-bytes-${index}`));
  await getPool().query(
    `INSERT INTO photos (tenant_id, uploaded_by_membership_id, object_key, original_filename, mime_type, byte_size, width, height, checksum_sha256, status, ready_at)
     VALUES ($1, $2, $3, $4, 'image/jpeg', 100, 10, 10, repeat('a', 64), 'ready', now())`,
    [tenant.tenant.id, tenant.ownerMembership.id, key, `IMG_${index}.jpg`]
  );
}

describe("exports, jobs, and archival", () => {
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

  it("runs an export end to end: queue, worker, ZIP in storage, expiring URL", async () => {
    const tenant = await provisionTestTenant();
    for (let i = 0; i < 3; i += 1) await insertReadyPhoto(storage, tenant, i);

    const requested = await requestExport(adminActor(tenant), noLimit);
    expect(requested.outcome).toBe("queued");
    if (requested.outcome !== "queued") return;

    const metrics = await runJobsOnce({ "album-export": runAlbumExportJob });
    expect(metrics).toEqual({ processed: 1, succeeded: 1, failed: 0 });

    const view = await getExport(adminActor(tenant), requested.export.id);
    expect(view?.status).toBe("completed");
    expect(view?.photoCount).toBe(3);
    expect(view?.downloadUrl).toContain("fake-storage.test/get/");

    const zipKey = [...storage.objects.keys()].find((key) => key.includes("/exports/"));
    expect(zipKey).toMatch(new RegExp(`^tenants/${tenant.tenant.id}/exports/.*\\.zip$`));
    // ZIP magic bytes prove a real archive was streamed into storage.
    expect(storage.objects.get(zipKey!)!.bytes.subarray(0, 2).toString("latin1")).toBe("PK");
  });

  it("enforces one active export per tenant and hides exports across tenants", async () => {
    const tenant = await provisionTestTenant();
    const other = await provisionTestTenant({ ownerDisplayName: "Mary Major" });

    const first = await requestExport(adminActor(tenant), noLimit);
    expect(first.outcome).toBe("queued");
    const second = await requestExport(adminActor(tenant), noLimit);
    expect(second.outcome).toBe("already-active");

    if (first.outcome !== "queued") return;
    expect(await getExport(adminActor(other), first.export.id)).toBeNull();
  });

  it("retries failed jobs with backoff and dead-letters after max attempts", async () => {
    await enqueueJob(getPool(), { type: "always-fails", maxAttempts: 2 });
    const failing = { "always-fails": async (_job: JobRow) => Promise.reject(new Error("boom")) };

    const firstRun = await runJobsOnce(failing);
    expect(firstRun.failed).toBe(1);
    let row = await getPool().query<{ status: string; run_at: Date }>("SELECT status, run_at FROM jobs LIMIT 1");
    expect(row.rows[0]!.status).toBe("failed");
    expect(row.rows[0]!.run_at.getTime()).toBeGreaterThan(Date.now()); // backoff scheduled

    await getPool().query("UPDATE jobs SET run_at = now() WHERE status = 'failed'");
    await runJobsOnce(failing);
    row = await getPool().query<{ status: string; run_at: Date }>("SELECT status, run_at FROM jobs LIMIT 1");
    expect(row.rows[0]!.status).toBe("dead");
  });

  it("expired exports are deleted along with their archives", async () => {
    const tenant = await provisionTestTenant();
    storage.put("zip-key", Buffer.from("PKfake"));
    await getPool().query(
      `INSERT INTO exports (tenant_id, requested_by_membership_id, status, object_key, completed_at, expires_at)
       VALUES ($1, $2, 'completed', 'zip-key', now() - interval '8 days', now() - interval '1 day')`,
      [tenant.tenant.id, tenant.ownerMembership.id]
    );
    expect(await deleteExpiredExports()).toBe(1);
    expect(storage.objects.has("zip-key")).toBe(false);
  });

});
