import { query, queryOne, type Queryable } from "@/lib/db";
import type { PhotoStatus } from "@/lib/repositories/types";

export interface PhotoRow {
  id: string;
  tenant_id: string;
  uploaded_by_membership_id: string;
  object_key: string;
  thumbnail_key: string | null;
  original_filename: string;
  mime_type: string;
  byte_size: string; // bigint arrives as string from pg
  width: number;
  height: number;
  description: string | null;
  checksum_sha256: string;
  status: PhotoStatus;
  captured_at: Date | null;
  created_at: Date;
  ready_at: Date | null;
  deleted_at: Date | null;
}

export interface CreatePendingPhotoInput {
  tenantId: string;
  membershipId: string;
  objectKey: string;
  originalFilename: string;
  mimeType: string;
  byteSize: number;
  width: number;
  height: number;
  checksumSha256: string;
}

export async function createPendingPhoto(db: Queryable, input: CreatePendingPhotoInput): Promise<PhotoRow> {
  const row = await queryOne<PhotoRow>(
    db,
    `INSERT INTO photos (tenant_id, uploaded_by_membership_id, object_key, original_filename, mime_type, byte_size, width, height, checksum_sha256, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, 'pending')
     RETURNING *`,
    [
      input.tenantId,
      input.membershipId,
      input.objectKey,
      input.originalFilename,
      input.mimeType,
      input.byteSize,
      input.width,
      input.height,
      input.checksumSha256
    ]
  );
  if (!row) throw new Error("photo insert returned no row");
  return row;
}

export async function findPhotoById(db: Queryable, tenantId: string, photoId: string): Promise<PhotoRow | null> {
  return queryOne<PhotoRow>(db, "SELECT * FROM photos WHERE tenant_id = $1 AND id = $2", [tenantId, photoId]);
}

export async function markPhotoReady(db: Queryable, tenantId: string, photoId: string, description: string | null): Promise<PhotoRow | null> {
  return queryOne<PhotoRow>(
    db,
    `UPDATE photos SET status = 'ready', ready_at = now(), description = $3
     WHERE tenant_id = $1 AND id = $2 AND status = 'pending'
     RETURNING *`,
    [tenantId, photoId, description]
  );
}

export async function markPhotoRejected(db: Queryable, tenantId: string, photoId: string): Promise<PhotoRow | null> {
  return queryOne<PhotoRow>(
    db,
    `UPDATE photos SET status = 'rejected'
     WHERE tenant_id = $1 AND id = $2 AND status = 'pending'
     RETURNING *`,
    [tenantId, photoId]
  );
}

export async function updatePhotoDescription(
  db: Queryable,
  tenantId: string,
  photoId: string,
  membershipId: string,
  description: string | null
): Promise<PhotoRow | null> {
  return queryOne<PhotoRow>(
    db,
    `UPDATE photos SET description = $4
     WHERE tenant_id = $1 AND id = $2 AND uploaded_by_membership_id = $3
       AND status = 'ready' AND deleted_at IS NULL
     RETURNING *`,
    [tenantId, photoId, membershipId, description]
  );
}

/** Uploader may delete their own photo; a tenant admin may delete any. */
export async function softDeletePhoto(
  db: Queryable,
  tenantId: string,
  photoId: string,
  requesterMembershipId: string,
  requesterIsAdmin: boolean
): Promise<PhotoRow | null> {
  return queryOne<PhotoRow>(
    db,
    `UPDATE photos SET status = 'deleted', deleted_at = now()
     WHERE tenant_id = $1 AND id = $2 AND deleted_at IS NULL
       AND (uploaded_by_membership_id = $3 OR $4 = true)
     RETURNING *`,
    [tenantId, photoId, requesterMembershipId, requesterIsAdmin]
  );
}

export interface PhotoPage {
  photos: PhotoRow[];
  hasMore: boolean;
}

export interface PhotoFeedOptions {
  limit: number;
  cursor?: { createdAt: string; id: string };
  uploaderMembershipId?: string;
}

/** Keyset pagination on (created_at DESC, id DESC); never offset. */
export async function listReadyPhotos(db: Queryable, tenantId: string, options: PhotoFeedOptions): Promise<PhotoPage> {
  const values: unknown[] = [tenantId, options.limit + 1];
  let where = "tenant_id = $1 AND status = 'ready' AND deleted_at IS NULL";
  if (options.uploaderMembershipId) {
    values.push(options.uploaderMembershipId);
    where += ` AND uploaded_by_membership_id = $${values.length}`;
  }
  if (options.cursor) {
    values.push(options.cursor.createdAt, options.cursor.id);
    where += ` AND (created_at, id) < ($${values.length - 1}::timestamptz, $${values.length}::uuid)`;
  }
  const rows = await query<PhotoRow>(
    db,
    `SELECT * FROM photos WHERE ${where} ORDER BY created_at DESC, id DESC LIMIT $2`,
    values
  );
  return { photos: rows.slice(0, options.limit), hasMore: rows.length > options.limit };
}

/** Pending uploads that never completed; caller deletes their objects too. */
export async function deleteAbandonedPendingPhotos(db: Queryable, olderThanHours: number): Promise<PhotoRow[]> {
  return query<PhotoRow>(
    db,
    `DELETE FROM photos
     WHERE status IN ('pending', 'rejected') AND created_at < now() - make_interval(hours => $1)
     RETURNING *`,
    [olderThanHours]
  );
}
