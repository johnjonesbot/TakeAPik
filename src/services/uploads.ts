import { createHash, randomUUID } from "node:crypto";
import { getEnv } from "@/lib/env";
import { getPool } from "@/lib/db";
import { ALLOWED_UPLOAD_MIME_TYPES, verifyImageBytes } from "@/lib/image-verify";
import { PostgresRateLimiter, type RateLimiter } from "@/lib/rate-limit";
import {
  createPendingPhoto,
  findPhotoById,
  markPhotoReady,
  markPhotoRejected,
  type PhotoRow
} from "@/lib/repositories/photos";
import { getStorage } from "@/lib/storage";
import { writeAuditEvent } from "@/services/audit";

const PUT_URL_TTL_SECONDS = 5 * 60;

const EXTENSION_BY_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp"
};

export interface UploadIntentInput {
  tenantId: string;
  membershipId: string;
  filename: string;
  mimeType: string;
  byteSize: number;
  width: number;
  height: number;
  checksumSha256: string;
}

export type UploadIntentResult =
  | { outcome: "created"; photo: PhotoRow; uploadUrl: string; expiresInSeconds: number }
  | { outcome: "invalid"; reason: string }
  | { outcome: "rate-limited" };

/**
 * Create the pending photo and a short-lived signed PUT URL. The object key
 * is server-generated and tenant-prefixed; nothing about it comes from the
 * client.
 */
export async function createUploadIntent(
  input: UploadIntentInput,
  limiter: RateLimiter = new PostgresRateLimiter(getPool())
): Promise<UploadIntentResult> {
  const env = getEnv();
  if (!ALLOWED_UPLOAD_MIME_TYPES.has(input.mimeType)) return { outcome: "invalid", reason: "unsupported-type" };
  if (input.byteSize < 1 || input.byteSize > env.MAX_UPLOAD_BYTES) return { outcome: "invalid", reason: "too-large" };
  if (input.width < 1 || input.width > env.MAX_IMAGE_WIDTH) return { outcome: "invalid", reason: "too-wide" };
  if (input.height < 1 || input.height > 8_192) return { outcome: "invalid", reason: "bad-dimensions" };
  if (!/^[0-9a-f]{64}$/.test(input.checksumSha256)) return { outcome: "invalid", reason: "bad-checksum" };

  const quota = await limiter.consume(`upload-intent:${input.tenantId}:${input.membershipId}`, 30, 10 * 60);
  if (!quota.allowed) return { outcome: "rate-limited" };

  const extension = EXTENSION_BY_MIME[input.mimeType] ?? "bin";
  const objectKey = `tenants/${input.tenantId}/photos/${randomUUID()}.${extension}`;

  const photo = await createPendingPhoto(getPool(), {
    tenantId: input.tenantId,
    membershipId: input.membershipId,
    objectKey,
    originalFilename: input.filename.slice(0, 255),
    mimeType: input.mimeType,
    byteSize: input.byteSize,
    width: input.width,
    height: input.height,
    checksumSha256: input.checksumSha256
  });

  const uploadUrl = await getStorage().createSignedPutUrl(objectKey, input.mimeType, input.byteSize, PUT_URL_TTL_SECONDS);
  return { outcome: "created", photo, uploadUrl, expiresInSeconds: PUT_URL_TTL_SECONDS };
}

export interface CompleteUploadInput {
  tenantId: string;
  membershipId: string;
  photoId: string;
  description?: string;
}

export type CompleteUploadResult =
  | { outcome: "ready"; photo: PhotoRow }
  | { outcome: "rejected"; reason: string }
  | { outcome: "not-found" };

/**
 * Verify the stored object against the declared metadata — size, checksum,
 * magic bytes, and a real decode — then move pending → ready. Anything that
 * fails verification is marked rejected and its object deleted.
 */
export async function completeUpload(input: CompleteUploadInput): Promise<CompleteUploadResult> {
  const db = getPool();
  const photo = await findPhotoById(db, input.tenantId, input.photoId);
  if (!photo || photo.uploaded_by_membership_id !== input.membershipId) return { outcome: "not-found" };
  if (photo.status !== "pending") return { outcome: "not-found" };

  const reject = async (reason: string): Promise<CompleteUploadResult> => {
    await markPhotoRejected(db, input.tenantId, photo.id);
    await getStorage().deleteObject(photo.object_key);
    await writeAuditEvent(db, {
      tenantId: input.tenantId,
      actorMembershipId: input.membershipId,
      action: "member.update",
      targetType: "photo",
      targetId: photo.id,
      metadata: { change: "upload-rejected", reason }
    });
    return { outcome: "rejected", reason };
  };

  const bytes = await getStorage().getObjectBytes(photo.object_key);
  if (!bytes) return reject("object-missing");
  if (bytes.length !== Number(photo.byte_size)) return reject("size-mismatch");
  if (createHash("sha256").update(bytes).digest("hex") !== photo.checksum_sha256) return reject("checksum-mismatch");

  const verification = await verifyImageBytes(bytes, {
    mimeType: photo.mime_type,
    width: photo.width,
    height: photo.height,
    maxWidth: getEnv().MAX_IMAGE_WIDTH
  });
  if (!verification.ok) return reject(verification.reason);

  const description = input.description?.trim().slice(0, 1000) || null;
  const ready = await markPhotoReady(db, input.tenantId, photo.id, description);
  if (!ready) return { outcome: "not-found" };
  return { outcome: "ready", photo: ready };
}
