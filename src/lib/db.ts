import { Pool, type PoolClient, type QueryResultRow } from "pg";
import { getEnv } from "@/lib/env";

let pool: Pool | undefined;

export function getPool(): Pool {
  if (!pool) {
    const env = getEnv();
    pool = new Pool({
      connectionString: env.DATABASE_URL,
      ssl: env.DATABASE_SSL ? { rejectUnauthorized: true } : undefined,
      max: 10,
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 5_000
    });
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}

/** A query executor that is either the shared pool or a transaction client. */
export type Queryable = Pick<Pool, "query"> | Pick<PoolClient, "query">;

export async function query<Row extends QueryResultRow>(
  executor: Queryable,
  text: string,
  values: readonly unknown[] = []
): Promise<Row[]> {
  const result = await executor.query<Row>(text, values as unknown[]);
  return result.rows;
}

export async function queryOne<Row extends QueryResultRow>(
  executor: Queryable,
  text: string,
  values: readonly unknown[] = []
): Promise<Row | null> {
  const rows = await query<Row>(executor, text, values);
  return rows[0] ?? null;
}

/**
 * Run `work` inside a transaction. Commits on resolve, rolls back on throw.
 */
export async function withTransaction<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query("BEGIN");
    const result = await work(client);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
}

export function isUniqueViolation(error: unknown, constraint?: string): boolean {
  if (typeof error !== "object" || error === null) return false;
  const candidate = error as { code?: string; constraint?: string };
  if (candidate.code !== "23505") return false;
  return constraint === undefined || candidate.constraint === constraint;
}
