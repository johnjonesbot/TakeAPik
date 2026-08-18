import { getPool } from "@/lib/db";
import { decodeCursor, encodeCursor } from "@/lib/cursor";
import {
  listReadyPhotos,
  softDeletePhoto,
  updatePhotoDescription,
  type PhotoRow
} from "@/lib/repositories/photos";
import { getStorage } from "@/lib/storage";
import { writeAuditEvent } from "@/services/audit";
import type { Actor } from "@/services/sessions";

const GET_URL_TTL_SECONDS = 10 * 60;
export const DEFAULT_PAGE_SIZE = 30;
export const MAX_PAGE_SIZE = 60;

export interface PhotoView {
  id: string;
  url: string;
  width: number;
  height: number;
  description: string | null;
  createdAt: string;
  isMine: boolean;
}

export interface PhotoFeed {
  photos: PhotoView[];
  nextCursor: string | null;
}

async function toView(photo: PhotoRow, viewerMembershipId: string): Promise<PhotoView> {
  return {
    id: photo.id,
    url: await getStorage().createSignedGetUrl(photo.object_key, GET_URL_TTL_SECONDS),
    width: photo.width,
    height: photo.height,
    description: photo.description,
    createdAt: photo.created_at.toISOString(),
    isMine: photo.uploaded_by_membership_id === viewerMembershipId
  };
}

export interface FeedQuery {
  tenantId: string;
  viewerMembershipId: string;
  cursor?: string;
  limit?: number;
  mineOnly?: boolean;
}

export async function getPhotoFeed(queryInput: FeedQuery): Promise<PhotoFeed | { invalidCursor: true }> {
  const cursor = queryInput.cursor ? decodeCursor(queryInput.cursor) : undefined;
  if (queryInput.cursor && !cursor) return { invalidCursor: true };

  const limit = Math.min(Math.max(queryInput.limit ?? DEFAULT_PAGE_SIZE, 1), MAX_PAGE_SIZE);
  const page = await listReadyPhotos(getPool(), queryInput.tenantId, {
    limit,
    cursor: cursor ?? undefined,
    uploaderMembershipId: queryInput.mineOnly ? queryInput.viewerMembershipId : undefined
  });

  const photos = await Promise.all(page.photos.map((photo) => toView(photo, queryInput.viewerMembershipId)));
  const last = page.photos.at(-1);
  return {
    photos,
    nextCursor:
      page.hasMore && last ? encodeCursor({ createdAt: last.created_at.toISOString(), id: last.id }) : null
  };
}

export async function editPhotoDescription(
  actor: Actor & { kind: "friend" | "admin" },
  photoId: string,
  description: string | null
): Promise<PhotoRow | null> {
  return updatePhotoDescription(getPool(), actor.tenantId, photoId, actor.membershipId, description);
}

/** Uploader removes their own photo; a tenant admin may moderate any photo. */
export async function removePhoto(actor: Actor & { kind: "friend" | "admin" }, photoId: string): Promise<PhotoRow | null> {
  const db = getPool();
  const deleted = await softDeletePhoto(db, actor.tenantId, photoId, actor.membershipId, actor.kind === "admin");
  if (deleted) {
    await writeAuditEvent(db, {
      tenantId: actor.tenantId,
      actorMembershipId: actor.membershipId,
      action: "member.update",
      targetType: "photo",
      targetId: deleted.id,
      metadata: {
        change: "photo-deleted",
        byUploader: deleted.uploaded_by_membership_id === actor.membershipId
      }
    });
  }
  return deleted;
}
