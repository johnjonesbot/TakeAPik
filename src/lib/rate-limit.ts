import { queryOne, type Queryable } from "@/lib/db";

export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
}

/**
 * Distributed-ready limiter interface. The Postgres implementation below is
 * the baseline; a Redis implementation can replace it without changing call
 * sites when horizontal scaling arrives.
 */
export interface RateLimiter {
  consume(key: string, limit: number, windowSeconds: number): Promise<RateLimitDecision>;
}

export class PostgresRateLimiter implements RateLimiter {
  constructor(private readonly db: Queryable) {}

  async consume(key: string, limit: number, windowSeconds: number): Promise<RateLimitDecision> {
    const row = await queryOne<{ count: number }>(
      this.db,
      `INSERT INTO rate_limit_buckets (key, window_started_at, count)
       VALUES ($1, to_timestamp(floor(extract(epoch FROM now()) / $2) * $2), 1)
       ON CONFLICT (key, window_started_at)
       DO UPDATE SET count = rate_limit_buckets.count + 1
       RETURNING count`,
      [key, windowSeconds]
    );
    const count = row?.count ?? limit + 1;
    return { allowed: count <= limit, remaining: Math.max(0, limit - count) };
  }
}

/** Delete buckets older than the longest window we use; call opportunistically. */
export async function pruneRateLimitBuckets(db: Queryable, olderThanSeconds = 24 * 60 * 60): Promise<void> {
  await db.query("DELETE FROM rate_limit_buckets WHERE window_started_at < now() - make_interval(secs => $1)", [
    olderThanSeconds
  ]);
}
