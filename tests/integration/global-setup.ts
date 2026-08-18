import { Client } from "pg";

/**
 * Create the integration-test database if needed and apply migrations. The
 * test database name is derived from DATABASE_URL so config lives in one
 * place (vitest.config.ts / TEST_DATABASE_URL).
 */
export default async function globalSetup(): Promise<void> {
  const url = new URL(
    process.env.TEST_DATABASE_URL ?? "postgresql://takeapik:takeapik-dev@127.0.0.1:5432/takeapik_test"
  );
  const databaseName = url.pathname.slice(1);

  const adminUrl = new URL(url.toString());
  adminUrl.pathname = "/postgres";
  const admin = new Client({ connectionString: adminUrl.toString() });
  await admin.connect();
  const exists = await admin.query("SELECT 1 FROM pg_database WHERE datname = $1", [databaseName]);
  if (exists.rowCount === 0) {
    await admin.query(`CREATE DATABASE "${databaseName.replaceAll('"', '""')}"`);
  }
  await admin.end();

  process.env.DATABASE_URL = url.toString();
  process.env.SESSION_SECRET ??= "test-session-secret-0123456789abcdef";
  process.env.TOKEN_HASH_PEPPER ??= "test-pepper-secret-0123456789abcdef";

  const { migrate } = await import("../../scripts/migrate");
  const { closePool } = await import("../../src/lib/db");
  await migrate();
  await closePool();
}
