import "./load-env";
import { closePool, getPool } from "@/lib/db";
import { getLogger } from "@/lib/logger";
import { pruneRateLimitBuckets } from "@/lib/rate-limit";
import { deleteAbandonedPendingPhotos } from "@/lib/repositories/photos";
import { getStorage } from "@/lib/storage";

const ABANDONED_AFTER_HOURS = 24;

/**
 * Housekeeping, intended for cron: remove pending uploads that never
 * completed (and rejected leftovers) plus their stored objects, and prune
 * expired rate-limit windows.
 */
export async function cleanup(): Promise<void> {
  const log = getLogger().child({ component: "cleanup" });
  const db = getPool();

  const removed = await deleteAbandonedPendingPhotos(db, ABANDONED_AFTER_HOURS);
  for (const photo of removed) {
    await getStorage().deleteObject(photo.object_key);
  }
  await pruneRateLimitBuckets(db);
  await db.query("DELETE FROM login_handoffs WHERE expires_at < now() - interval '1 hour'");
  await db.query("DELETE FROM sessions WHERE expires_at < now() - interval '30 days'");

  log.info("cleanup finished", { abandonedPhotosRemoved: removed.length });
}

const isDirectRun = process.argv[1]?.endsWith("cleanup.ts") ?? false;
if (isDirectRun) {
  cleanup()
    .then(() => closePool())
    .catch((error) => {
      getLogger().error("cleanup failed", { error });
      process.exitCode = 1;
      return closePool();
    });
}
