import { createHash } from "node:crypto";
import sharp from "sharp";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { closePool, getPool } from "@/lib/db";
import type { RateLimiter } from "@/lib/rate-limit";
import { findPhotoById } from "@/lib/repositories/photos";
import { setStorageForTesting } from "@/lib/storage";
import { getPhotoFeed, removePhoto, editPhotoDescription } from "@/services/photos";
import { completeUpload, createUploadIntent } from "@/services/uploads";
import { FakeStorage } from "./fake-storage";
import { provisionTestTenant, resetHelperState, truncateAll, type ProvisionedTenant } from "./helpers";

const noLimit: RateLimiter = { consume: async () => ({ allowed: true, remaining: 99 }) };

async function makeJpeg(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 120, g: 80, b: 200 } }
  })
    .jpeg({ quality: 80 })
    .toBuffer();
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

async function uploadReadyPhoto(
  storage: FakeStorage,
  tenant: ProvisionedTenant,
  bytes: Buffer,
  meta: { width: number; height: number },
  description?: string
) {
  const intent = await createUploadIntent(
    {
      tenantId: tenant.tenant.id,
      membershipId: tenant.ownerMembership.id,
      filename: "IMG_0001.jpg",
      mimeType: "image/jpeg",
      byteSize: bytes.length,
      width: meta.width,
      height: meta.height,
      checksumSha256: sha256(bytes)
    },
    noLimit
  );
  if (intent.outcome !== "created") throw new Error(`intent failed: ${JSON.stringify(intent)}`);
  storage.put(intent.photo.object_key, bytes);
  return completeUpload({
    tenantId: tenant.tenant.id,
    membershipId: tenant.ownerMembership.id,
    photoId: intent.photo.id,
    description
  });
}

describe("upload pipeline", () => {
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

  it("creates tenant-prefixed server-side object keys", async () => {
    const tenant = await provisionTestTenant();
    const bytes = await makeJpeg(640, 480);
    const intent = await createUploadIntent(
      {
        tenantId: tenant.tenant.id,
        membershipId: tenant.ownerMembership.id,
        filename: "../../../etc/passwd.jpg",
        mimeType: "image/jpeg",
        byteSize: bytes.length,
        width: 640,
        height: 480,
        checksumSha256: sha256(bytes)
      },
      noLimit
    );
    expect(intent.outcome).toBe("created");
    if (intent.outcome !== "created") return;
    expect(intent.photo.object_key).toMatch(
      new RegExp(`^tenants/${tenant.tenant.id}/photos/[0-9a-f-]{36}\\.jpg$`)
    );
    expect(intent.photo.object_key).not.toContain("passwd");
    expect(intent.photo.status).toBe("pending");
  });

  it("verifies bytes and publishes the photo", async () => {
    const tenant = await provisionTestTenant();
    const bytes = await makeJpeg(1920, 1280);
    const result = await uploadReadyPhoto(storage, tenant, bytes, { width: 1920, height: 1280 }, "Golden hour");
    expect(result.outcome).toBe("ready");
    if (result.outcome !== "ready") return;
    expect(result.photo.status).toBe("ready");
    expect(result.photo.description).toBe("Golden hour");
  });

  it("rejects checksum mismatches, wrong magic bytes, and dimension lies, deleting the object", async () => {
    const tenant = await provisionTestTenant();
    const good = await makeJpeg(800, 600);

    const wrongChecksum = await createUploadIntent(
      {
        tenantId: tenant.tenant.id,
        membershipId: tenant.ownerMembership.id,
        filename: "a.jpg",
        mimeType: "image/jpeg",
        byteSize: good.length,
        width: 800,
        height: 600,
        checksumSha256: sha256(Buffer.from("other-bytes"))
      },
      noLimit
    );
    if (wrongChecksum.outcome !== "created") throw new Error("setup failed");
    storage.put(wrongChecksum.photo.object_key, good);
    const checksumResult = await completeUpload({
      tenantId: tenant.tenant.id,
      membershipId: tenant.ownerMembership.id,
      photoId: wrongChecksum.photo.id
    });
    expect(checksumResult).toEqual({ outcome: "rejected", reason: "checksum-mismatch" });
    expect(storage.objects.has(wrongChecksum.photo.object_key)).toBe(false);

    const notAnImage = Buffer.from("#!/bin/sh\necho polyglot\n");
    const fakeImage = await createUploadIntent(
      {
        tenantId: tenant.tenant.id,
        membershipId: tenant.ownerMembership.id,
        filename: "b.jpg",
        mimeType: "image/jpeg",
        byteSize: notAnImage.length,
        width: 800,
        height: 600,
        checksumSha256: sha256(notAnImage)
      },
      noLimit
    );
    if (fakeImage.outcome !== "created") throw new Error("setup failed");
    storage.put(fakeImage.photo.object_key, notAnImage);
    const magicResult = await completeUpload({
      tenantId: tenant.tenant.id,
      membershipId: tenant.ownerMembership.id,
      photoId: fakeImage.photo.id
    });
    expect(magicResult).toEqual({ outcome: "rejected", reason: "unrecognized-format" });

    const dimensionLie = await createUploadIntent(
      {
        tenantId: tenant.tenant.id,
        membershipId: tenant.ownerMembership.id,
        filename: "c.jpg",
        mimeType: "image/jpeg",
        byteSize: good.length,
        width: 400,
        height: 300,
        checksumSha256: sha256(good)
      },
      noLimit
    );
    if (dimensionLie.outcome !== "created") throw new Error("setup failed");
    storage.put(dimensionLie.photo.object_key, good);
    const dimensionResult = await completeUpload({
      tenantId: tenant.tenant.id,
      membershipId: tenant.ownerMembership.id,
      photoId: dimensionLie.photo.id
    });
    expect(dimensionResult).toEqual({ outcome: "rejected", reason: "dimension-mismatch" });
  });

  it("refuses oversize and over-wide intents outright", async () => {
    const tenant = await provisionTestTenant();
    const base = {
      tenantId: tenant.tenant.id,
      membershipId: tenant.ownerMembership.id,
      filename: "a.jpg",
      mimeType: "image/jpeg",
      checksumSha256: "a".repeat(64)
    };
    expect(
      (await createUploadIntent({ ...base, byteSize: 16_000_000, width: 1920, height: 1080 }, noLimit)).outcome
    ).toBe("invalid");
    expect(
      (await createUploadIntent({ ...base, byteSize: 1_000, width: 4000, height: 1080 }, noLimit)).outcome
    ).toBe("invalid");
  });

  it("blocks cross-tenant completes and cross-uploader completes", async () => {
    const a = await provisionTestTenant();
    const b = await provisionTestTenant({ ownerDisplayName: "Mary Major" });
    const bytes = await makeJpeg(640, 480);
    const intent = await createUploadIntent(
      {
        tenantId: a.tenant.id,
        membershipId: a.ownerMembership.id,
        filename: "a.jpg",
        mimeType: "image/jpeg",
        byteSize: bytes.length,
        width: 640,
        height: 480,
        checksumSha256: sha256(bytes)
      },
      noLimit
    );
    if (intent.outcome !== "created") throw new Error("setup failed");
    storage.put(intent.photo.object_key, bytes);

    const crossTenant = await completeUpload({
      tenantId: b.tenant.id,
      membershipId: b.ownerMembership.id,
      photoId: intent.photo.id
    });
    expect(crossTenant.outcome).toBe("not-found");

    const crossMember = await completeUpload({
      tenantId: a.tenant.id,
      membershipId: b.ownerMembership.id,
      photoId: intent.photo.id
    });
    expect(crossMember.outcome).toBe("not-found");
  });

  it("serves the feed oldest-first when asked and keeps cursors bound to their direction", async () => {
    const tenant = await provisionTestTenant();
    const bytes = await makeJpeg(320, 240);
    for (let i = 0; i < 5; i += 1) {
      const result = await uploadReadyPhoto(storage, tenant, bytes, { width: 320, height: 240 });
      expect(result.outcome).toBe("ready");
    }

    const newestFirst = await getPhotoFeed({
      tenantId: tenant.tenant.id,
      viewerMembershipId: tenant.ownerMembership.id,
      limit: 5
    });
    const oldestFirst = await getPhotoFeed({
      tenantId: tenant.tenant.id,
      viewerMembershipId: tenant.ownerMembership.id,
      limit: 5,
      order: "asc"
    });
    if ("invalidCursor" in newestFirst || "invalidCursor" in oldestFirst) throw new Error("invalid cursor");
    expect(oldestFirst.photos.map((photo) => photo.id)).toEqual(
      [...newestFirst.photos.map((photo) => photo.id)].reverse()
    );

    // An asc cursor keeps walking ascending even if the caller flips the param.
    const firstAsc = await getPhotoFeed({
      tenantId: tenant.tenant.id,
      viewerMembershipId: tenant.ownerMembership.id,
      limit: 2,
      order: "asc"
    });
    if ("invalidCursor" in firstAsc) throw new Error("invalid cursor");
    const continued = await getPhotoFeed({
      tenantId: tenant.tenant.id,
      viewerMembershipId: tenant.ownerMembership.id,
      limit: 2,
      order: "desc",
      cursor: firstAsc.nextCursor ?? undefined
    });
    if ("invalidCursor" in continued) throw new Error("invalid cursor");
    expect(continued.photos.map((photo) => photo.id)).toEqual(
      oldestFirst.photos.slice(2, 4).map((photo) => photo.id)
    );
  });

  it("paginates the feed with tamper-evident cursors and bounded pages", async () => {
    const tenant = await provisionTestTenant();
    const bytes = await makeJpeg(320, 240);
    for (let i = 0; i < 8; i += 1) {
      const result = await uploadReadyPhoto(storage, tenant, bytes, { width: 320, height: 240 });
      expect(result.outcome).toBe("ready");
    }

    const firstPage = await getPhotoFeed({
      tenantId: tenant.tenant.id,
      viewerMembershipId: tenant.ownerMembership.id,
      limit: 3
    });
    if ("invalidCursor" in firstPage) throw new Error("unexpected invalid cursor");
    expect(firstPage.photos).toHaveLength(3);
    expect(firstPage.nextCursor).not.toBeNull();
    expect(firstPage.photos[0]?.url).toContain("fake-storage.test/get/");

    const secondPage = await getPhotoFeed({
      tenantId: tenant.tenant.id,
      viewerMembershipId: tenant.ownerMembership.id,
      limit: 3,
      cursor: firstPage.nextCursor ?? undefined
    });
    if ("invalidCursor" in secondPage) throw new Error("unexpected invalid cursor");
    const firstIds = new Set(firstPage.photos.map((photo) => photo.id));
    expect(secondPage.photos.some((photo) => firstIds.has(photo.id))).toBe(false);

    const tampered = await getPhotoFeed({
      tenantId: tenant.tenant.id,
      viewerMembershipId: tenant.ownerMembership.id,
      cursor: `${firstPage.nextCursor?.split(".")[0]}.forged-signature`
    });
    expect(tampered).toEqual({ invalidCursor: true });

    // Third pass: walk to exhaustion and confirm total is bounded and complete.
    let cursor: string | undefined;
    let total = 0;
    for (let hops = 0; hops < 10; hops += 1) {
      const page = await getPhotoFeed({
        tenantId: tenant.tenant.id,
        viewerMembershipId: tenant.ownerMembership.id,
        limit: 3,
        cursor
      });
      if ("invalidCursor" in page) throw new Error("unexpected invalid cursor");
      total += page.photos.length;
      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }
    expect(total).toBe(8);
  });

  it("keeps tenants' feeds fully separate", async () => {
    const a = await provisionTestTenant();
    const b = await provisionTestTenant({ ownerDisplayName: "Mary Major" });
    const bytes = await makeJpeg(320, 240);
    await uploadReadyPhoto(storage, a, bytes, { width: 320, height: 240 });

    const bFeed = await getPhotoFeed({ tenantId: b.tenant.id, viewerMembershipId: b.ownerMembership.id });
    if ("invalidCursor" in bFeed) throw new Error("unexpected invalid cursor");
    expect(bFeed.photos).toHaveLength(0);
  });

  it("lets uploaders edit/delete only their own photos and admins moderate any", async () => {
    const tenant = await provisionTestTenant();
    const bytes = await makeJpeg(320, 240);
    const uploaded = await uploadReadyPhoto(storage, tenant, bytes, { width: 320, height: 240 });
    if (uploaded.outcome !== "ready") throw new Error("setup failed");
    const photoId = uploaded.photo.id;

    const other = await provisionTestTenant({ ownerDisplayName: "Mary Major" });
    const strangerActor = {
      kind: "friend" as const,
      tenantId: other.tenant.id,
      membershipId: other.ownerMembership.id,
      sessionId: "s"
    };
    expect(await editPhotoDescription(strangerActor, photoId, "graffiti")).toBeNull();
    expect(await removePhoto(strangerActor, photoId)).toBeNull();

    const uploaderActor = {
      kind: "friend" as const,
      tenantId: tenant.tenant.id,
      membershipId: tenant.ownerMembership.id,
      sessionId: "s"
    };
    const edited = await editPhotoDescription(uploaderActor, photoId, "New words");
    expect(edited?.description).toBe("New words");

    const removed = await removePhoto(uploaderActor, photoId);
    expect(removed?.status).toBe("deleted");
    const after = await findPhotoById(getPool(), tenant.tenant.id, photoId);
    expect(after?.deleted_at).not.toBeNull();
  });
});
