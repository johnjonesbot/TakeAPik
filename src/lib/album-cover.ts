import { getPool, queryOne } from "@/lib/db";
import { getStorage } from "@/lib/storage";

/**
 * Signed URL for the album's admin-selected cover photo, used as a blurred
 * page backdrop on every /a/:slug surface including the login screen — the
 * slug alone reveals at most one deliberately chosen photo, never the album.
 */
export async function getAlbumCoverUrl(slug: string): Promise<string | null> {
  const row = await queryOne<{ object_key: string }>(
    getPool(),
    `SELECT p.object_key
     FROM tenants t
     JOIN events e ON e.tenant_id = t.id
     JOIN photos p ON p.id = e.cover_photo_id AND p.tenant_id = t.id
     WHERE t.slug = $1 AND t.status != 'archived' AND p.status = 'ready' AND p.deleted_at IS NULL`,
    [slug.toLowerCase()]
  );
  if (!row) return null;
  try {
    return await getStorage().createSignedGetUrl(row.object_key, 3600);
  } catch {
    return null;
  }
}
