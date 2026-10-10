import type { Pool } from 'pg';
import { createDatabaseIfMissing } from '../../src/database/database-administration';
import { createDatabasePool } from '../../src/database/database-pool';
import { runMigrations } from '../../src/database/migration-runner';

/** Set by test-environment.ts (a Jest setup file) before any test file loads. */
export function testDatabaseUrl(): string {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) throw new Error('TEST_DATABASE_URL is not set; is test/support/test-environment.ts a setup file?');
  return url;
}

/**
 * Creates `art_auction_test` if needed and migrates it. Safe to call from every test file:
 * creation tolerates a race and migrating an up-to-date database is a no-op.
 */
export async function prepareTestDatabase(): Promise<void> {
  await createDatabaseIfMissing(testDatabaseUrl());
  const pool = createTestPool();
  try {
    await runMigrations(pool);
  } finally {
    await pool.end();
  }
}

export function createTestPool(options: { max?: number } = {}): Pool {
  return createDatabasePool({ connectionString: testDatabaseUrl(), max: options.max ?? 5, applicationName: 'art-auction-test' });
}

/**
 * Empties every application table (not `schema_migrations`) in one statement. CASCADE follows
 * foreign keys, so the order of tables does not matter as the schema grows.
 */
export async function truncateAllTables(pool: Pool): Promise<void> {
  const { rows } = await pool.query<{ tablename: string }>(
    `SELECT tablename FROM pg_tables
      WHERE schemaname = current_schema() AND tablename <> 'schema_migrations'`,
  );
  if (rows.length === 0) return;
  const tableList = rows.map((row) => `"${row.tablename}"`).join(', ');
  await pool.query(`TRUNCATE ${tableList} RESTART IDENTITY CASCADE`);
}
