import { randomUUID } from "node:crypto";
import { PassThrough } from "node:stream";
import { ZipArchive } from "archiver";
import { getPool, isUniqueViolation, query, queryOne } from "@/lib/db";
import { getLogger } from "@/lib/logger";
import { PostgresRateLimiter, type RateLimiter } from "@/lib/rate-limit";
import { getStorage } from "@/lib/storage";
import { writeAuditEvent } from "@/services/audit";
import type { AdminActor } from "@/services/event-admin";
import { enqueueJob, type JobRow } from "@/services/jobs";

const EXPORT_TTL_DAYS = 7;
const DOWNLOAD_URL_TTL_SECONDS = 15 * 60;

export type ExportStatus = "queued" | "running" | "completed" | "failed";

export interface ExportRow {
  id: string;
  tenant_id: string;
  requested_by_membership_id: string;
  job_id: string | null;
  status: ExportStatus;
  object_key: string | null;
  photo_count: number | null;
  byte_size: string | null;
  error: string | null;
  created_at: Date;
  completed_at: Date | null;
  expires_at: Date | null;
}

export interface ExportView {
  id: string;
  status: ExportStatus;
  photoCount: number | null;
  createdAt: string;
  completedAt: string | null;
  expiresAt: string | null;
  /** Present only when completed and unexpired. */
  downloadUrl?: string;
}

async function toView(row: ExportRow): Promise<ExportView> {
  const view: ExportView = {
    id: row.id,
    status: row.status,
    photoCount: row.photo_count,
    createdAt: row.created_at.toISOString(),
    completedAt: row.completed_at ? row.completed_at.toISOString() : null,
    expiresAt: row.expires_at ? row.expires_at.toISOString() : null
  };
  if (row.status === "completed" && row.object_key && row.expires_at && row.expires_at > new Date()) {
    view.downloadUrl = await getStorage().createSignedGetUrl(row.object_key, DOWNLOAD_URL_TTL_SECONDS);
  }
  return view;
}

export type RequestExportResult =
  | { outcome: "queued"; export: ExportView }
  | { outcome: "already-active" }
  | { outcome: "rate-limited" };

/** Admin-only. One active export per tenant (DB-enforced) and 3 per day. */
export async function requestExport(
  actor: AdminActor,
  limiter: RateLimiter = new PostgresRateLimiter(getPool())
): Promise<RequestExportResult> {
  const db = getPool();
  const daily = await limiter.consume(`export:${actor.tenantId}`, 3, 24 * 60 * 60);
  if (!daily.allowed) return { outcome: "rate-limited" };

  try {
    const job = await enqueueJob(db, { type: "album-export", tenantId: actor.tenantId });
    const row = await queryOne<ExportRow>(
      db,
      `INSERT INTO exports (tenant_id, requested_by_membership_id, job_id)
       VALUES ($1, $2, $3) RETURNING *`,
      [actor.tenantId, actor.membershipId, job.id]
    );
    if (!row) throw new Error("export insert returned no row");
    await db.query("UPDATE jobs SET payload = jsonb_build_object('exportId', $2::text) WHERE id = $1", [
      job.id,
      row.id
    ]);
    await writeAuditEvent(db, {
      tenantId: actor.tenantId,
      actorPlatformUserId: actor.platformUserId,
      actorMembershipId: actor.membershipId,
      action: "album.export.request",
      targetType: "export",
      targetId: row.id
    });
    return { outcome: "queued", export: await toView(row) };
  } catch (error) {
    if (isUniqueViolation(error, "exports_one_active_idx")) return { outcome: "already-active" };
    throw error;
  }
}

export async function getExport(actor: AdminActor, exportId: string): Promise<ExportView | null> {
  const row = await queryOne<ExportRow>(getPool(), "SELECT * FROM exports WHERE tenant_id = $1 AND id = $2", [
    actor.tenantId,
    exportId
  ]);
  return row ? toView(row) : null;
}

interface ExportPhotoRow {
  id: string;
  object_key: string;
  original_filename: string;
  created_at: Date;
}

/**
 * Job handler: stream every ready photo from object storage through a ZIP
 * encoder back into object storage. Constant memory: one photo stream at a
 * time on the read side, multipart upload on the write side; bytes never
 * transit the web process.
 */
export async function runAlbumExportJob(job: JobRow): Promise<void> {
  const db = getPool();
  const exportId = String(job.payload.exportId ?? "");
  const tenantId = job.tenant_id;
  if (!exportId || !tenantId) throw new Error("export job missing exportId/tenantId");

  const claimed = await queryOne<ExportRow>(
    db,
    `UPDATE exports SET status = 'running' WHERE id = $1 AND tenant_id = $2 AND status IN ('queued', 'running') RETURNING *`,
    [exportId, tenantId]
  );
  if (!claimed) throw new Error("export record not found or finished");

  try {
    const photos = await query<ExportPhotoRow>(
      db,
      `SELECT id, object_key, original_filename, created_at FROM photos
       WHERE tenant_id = $1 AND status = 'ready' AND deleted_at IS NULL
       ORDER BY created_at, id`,
      [tenantId]
    );

    const storage = getStorage();
    const objectKey = `tenants/${tenantId}/exports/${randomUUID()}.zip`;
    const archive = new ZipArchive({ zlib: { level: 0 } }); // photos are already compressed
    const output = new PassThrough();
    archive.pipe(output);

    const uploadDone = storage.putObjectStream(objectKey, output, "application/zip");

    let count = 0;
    for (const photo of photos) {
      const stream = await storage.getObjectStream(photo.object_key);
      if (!stream) {
        getLogger().warn("export skipping missing object", { photoId: photo.id });
        continue;
      }
      count += 1;
      const stamp = photo.created_at.toISOString().slice(0, 10);
      archive.append(stream, { name: `${stamp}-${String(count).padStart(4, "0")}-${photo.original_filename}` });
    }
    await archive.finalize();
    await uploadDone;

    await db.query(
      `UPDATE exports SET status = 'completed', object_key = $3, photo_count = $4,
         completed_at = now(), expires_at = now() + make_interval(days => $5), error = NULL
       WHERE id = $1 AND tenant_id = $2`,
      [exportId, tenantId, objectKey, count, EXPORT_TTL_DAYS]
    );
  } catch (error) {
    await db.query(
      "UPDATE exports SET status = 'failed', error = $3 WHERE id = $1 AND tenant_id = $2",
      [exportId, tenantId, error instanceof Error ? error.message.slice(0, 300) : "export-failed"]
    );
    throw error;
  }
}

/** Retention: delete expired export archives and their rows. */
export async function deleteExpiredExports(): Promise<number> {
  const db = getPool();
  const rows = await query<ExportRow>(
    db,
    "DELETE FROM exports WHERE expires_at IS NOT NULL AND expires_at < now() RETURNING *"
  );
  for (const row of rows) {
    if (row.object_key) await getStorage().deleteObject(row.object_key);
  }
  return rows.length;
}
