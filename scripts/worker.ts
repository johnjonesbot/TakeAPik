import "./load-env";
import { closePool } from "@/lib/db";
import { getLogger } from "@/lib/logger";
import { runAlbumExportJob } from "@/services/exports";
import { runJobsOnce, type JobHandler } from "@/services/jobs";

const HANDLERS: Record<string, JobHandler> = {
  "album-export": runAlbumExportJob
};

const POLL_INTERVAL_MS = 5_000;

/**
 * Background worker. `--once` drains due jobs and exits (cron-friendly);
 * without it, polls forever and stops cleanly on SIGINT/SIGTERM.
 */
async function main(): Promise<void> {
  const log = getLogger().child({ component: "worker" });
  const once = process.argv.includes("--once");

  if (once) {
    const metrics = await runJobsOnce(HANDLERS);
    log.info("worker drained", { ...metrics });
    return;
  }

  let running = true;
  const stop = () => {
    running = false;
  };
  process.on("SIGINT", stop);
  process.on("SIGTERM", stop);

  log.info("worker started");
  while (running) {
    const metrics = await runJobsOnce(HANDLERS);
    if (metrics.processed > 0) log.info("worker cycle", { ...metrics });
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }
  log.info("worker stopped");
}

main()
  .then(() => closePool())
  .catch((error) => {
    getLogger().error("worker crashed", { error });
    process.exitCode = 1;
    return closePool();
  });
