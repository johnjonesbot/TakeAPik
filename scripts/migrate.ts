import "./load-env";
import { createHash } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { closePool, withTransaction } from "@/lib/db";
import { getLogger } from "@/lib/logger";

const MIGRATIONS_DIR = path.join(process.cwd(), "db", "migrations");
const FILENAME_PATTERN = /^\d{4}_[a-z0-9_]+\.sql$/;

interface AppliedRow {
  name: string;
  checksum: string;
}

async function loadMigrationFiles(): Promise<Array<{ name: string; sql: string; checksum: string }>> {
  const entries = (await readdir(MIGRATIONS_DIR)).filter((name) => name.endsWith(".sql")).sort();
  const invalid = entries.filter((name) => !FILENAME_PATTERN.test(name));
  if (invalid.length > 0) {
    throw new Error(`Migration filenames must match NNNN_name.sql: ${invalid.join(", ")}`);
  }
  return Promise.all(
    entries.map(async (name) => {
      const sql = await readFile(path.join(MIGRATIONS_DIR, name), "utf8");
      return { name, sql, checksum: createHash("sha256").update(sql).digest("hex") };
    })
  );
}

export async function migrate(): Promise<void> {
  const log = getLogger().child({ component: "migrate" });
  const files = await loadMigrationFiles();

  await withTransaction(async (client) => {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        name text PRIMARY KEY,
        checksum text NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);
    // Serialize concurrent migrators (e.g. two deploy targets) on an advisory lock.
    await client.query("SELECT pg_advisory_xact_lock(hashtext('takeapik_schema_migrations'))");

    const applied = new Map(
      (await client.query<AppliedRow>("SELECT name, checksum FROM schema_migrations")).rows.map((row) => [
        row.name,
        row.checksum
      ])
    );

    for (const file of files) {
      const existing = applied.get(file.name);
      if (existing !== undefined) {
        if (existing !== file.checksum) {
          throw new Error(`Migration ${file.name} changed after being applied; add a new migration instead`);
        }
        continue;
      }
      log.info("applying migration", { name: file.name });
      await client.query(file.sql);
      await client.query("INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)", [
        file.name,
        file.checksum
      ]);
    }
  });

  log.info("migrations up to date", { count: files.length });
}

const isDirectRun = process.argv[1]?.endsWith("migrate.ts") ?? false;
if (isDirectRun) {
  migrate()
    .then(() => closePool())
    .catch((error) => {
      getLogger().error("migration failed", { error });
      process.exitCode = 1;
      return closePool();
    });
}
