import { hostname } from "node:os";
import { getPool, queryOne, type Queryable } from "@/lib/db";
import { getLogger } from "@/lib/logger";

export type JobStatus = "queued" | "running" | "succeeded" | "failed" | "dead";

export interface JobRow {
  id: string;
  type: string;
  tenant_id: string | null;
  payload: Record<string, unknown>;
  status: JobStatus;
  attempts: number;
  max_attempts: number;
  run_at: Date;
  last_error: string | null;
}

export type JobHandler = (job: JobRow) => Promise<void>;

export async function enqueueJob(
  db: Queryable,
  input: { type: string; tenantId?: string; payload?: Record<string, unknown>; maxAttempts?: number }
): Promise<JobRow> {
  const row = await queryOne<JobRow>(
    db,
    `INSERT INTO jobs (type, tenant_id, payload, max_attempts)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [input.type, input.tenantId ?? null, JSON.stringify(input.payload ?? {}), input.maxAttempts ?? 3]
  );
  if (!row) throw new Error("job insert returned no row");
  return row;
}

/** Claim one due job with SKIP LOCKED so concurrent workers never collide. */
async function claimJob(workerId: string): Promise<JobRow | null> {
  return queryOne<JobRow>(
    getPool(),
    `UPDATE jobs SET status = 'running', locked_at = now(), locked_by = $1, attempts = attempts + 1
     WHERE id = (
       SELECT id FROM jobs
       WHERE status IN ('queued', 'failed') AND run_at <= now()
       ORDER BY run_at
       FOR UPDATE SKIP LOCKED
       LIMIT 1
     )
     RETURNING *`,
    [workerId]
  );
}

async function finishJob(jobId: string, error?: string): Promise<void> {
  const db = getPool();
  if (!error) {
    await db.query("UPDATE jobs SET status = 'succeeded', finished_at = now(), last_error = NULL WHERE id = $1", [
      jobId
    ]);
    return;
  }
  // Exponential backoff: 30s, 60s, 120s… then dead-letter past max_attempts.
  await db.query(
    `UPDATE jobs SET
       status = CASE WHEN attempts >= max_attempts THEN 'dead'::job_status ELSE 'failed'::job_status END,
       finished_at = CASE WHEN attempts >= max_attempts THEN now() ELSE NULL END,
       run_at = now() + make_interval(secs => 30 * power(2, attempts - 1)),
       last_error = $2
     WHERE id = $1`,
    [jobId, error.slice(0, 500)]
  );
}

export interface WorkerMetrics {
  processed: number;
  succeeded: number;
  failed: number;
}

/**
 * Drain due jobs once (cron-friendly) or poll continuously. Handlers are
 * registered by type; an unknown type dead-letters immediately.
 */
export async function runJobsOnce(handlers: Record<string, JobHandler>, workerId = `worker-${hostname()}`): Promise<WorkerMetrics> {
  const log = getLogger().child({ component: "jobs", workerId });
  const metrics: WorkerMetrics = { processed: 0, succeeded: 0, failed: 0 };

  for (;;) {
    const job = await claimJob(workerId);
    if (!job) break;
    metrics.processed += 1;
    const handler = handlers[job.type];
    if (!handler) {
      await getPool().query("UPDATE jobs SET status = 'dead', finished_at = now(), last_error = 'no-handler' WHERE id = $1", [job.id]);
      metrics.failed += 1;
      log.error("no handler for job type", { jobId: job.id, type: job.type });
      continue;
    }
    try {
      await handler(job);
      await finishJob(job.id);
      metrics.succeeded += 1;
      log.info("job succeeded", { jobId: job.id, type: job.type, attempts: job.attempts });
    } catch (error) {
      await finishJob(job.id, error instanceof Error ? error.message : "unknown-error");
      metrics.failed += 1;
      log.warn("job failed", { jobId: job.id, type: job.type, attempts: job.attempts, error });
    }
  }

  return metrics;
}
