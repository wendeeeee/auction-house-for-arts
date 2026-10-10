import { createHash } from 'node:crypto';
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import type { Pool, PoolClient } from 'pg';

export const MIGRATIONS_DIRECTORY = join(__dirname, 'migrations');

/**
 * Arbitrary but fixed: every runner takes this advisory lock, so two processes started at once
 * (two API replicas, or `npm start` while CI migrates) apply migrations one after the other.
 */
const MIGRATION_ADVISORY_LOCK_KEY = 4_101_001;

const MIGRATION_FILE_PATTERN = /^(\d{3})_[a-z0-9_]+\.sql$/;

export interface MigrationRunResult {
  readonly applied: readonly string[];
  readonly skipped: readonly string[];
}

export interface MigrationRunOptions {
  readonly migrationsDirectory?: string;
  readonly log?: (message: string) => void;
}

/** These run from the CLI and tests, never inside a request, so they are plain Errors. */
export class MigrationFailedError extends Error {
  constructor(
    readonly migration: string,
    cause: unknown,
  ) {
    super(`Migration ${migration} failed and was rolled back: ${cause instanceof Error ? cause.message : String(cause)}`, {
      cause,
    });
    this.name = 'MigrationFailedError';
  }
}

export class MigrationChecksumMismatchError extends Error {
  constructor(readonly migration: string) {
    super(
      `Migration ${migration} was edited after it was applied. Applied migrations are immutable: ` +
        'add a new migration instead.',
    );
    this.name = 'MigrationChecksumMismatchError';
  }
}

export class InvalidMigrationFilesError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidMigrationFilesError';
  }
}

interface MigrationFile {
  readonly name: string;
  readonly sql: string;
  readonly checksum: string;
}

/**
 * Applies `NNN_description.sql` files in order. Each file runs in its own transaction
 * together with its `schema_migrations` row, so a migration is either fully applied and
 * recorded, or not applied at all. The run stops at the first failure.
 *
 * Re-running is a no-op for applied files. Their checksum is compared, so editing an applied
 * migration is caught instead of silently diverging between environments.
 *
 * A migration cannot use statements that refuse to run in a transaction
 * (`CREATE INDEX CONCURRENTLY`); none are needed at this scale.
 */
export async function runMigrations(pool: Pool, options: MigrationRunOptions = {}): Promise<MigrationRunResult> {
  const log = options.log ?? (() => undefined);
  const files = await readMigrationFiles(options.migrationsDirectory ?? MIGRATIONS_DIRECTORY);

  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_ADVISORY_LOCK_KEY]);
    try {
      return await applyPendingMigrations(client, files, log);
    } finally {
      await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_ADVISORY_LOCK_KEY]);
    }
  } finally {
    client.release();
  }
}

async function applyPendingMigrations(
  client: PoolClient,
  files: readonly MigrationFile[],
  log: (message: string) => void,
): Promise<MigrationRunResult> {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name        TEXT PRIMARY KEY,
      checksum    TEXT NOT NULL,
      applied_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
  const { rows } = await client.query<{ name: string; checksum: string }>(
    'SELECT name, checksum FROM schema_migrations',
  );
  const appliedChecksums = new Map(rows.map((row) => [row.name, row.checksum]));

  const applied: string[] = [];
  const skipped: string[] = [];
  for (const file of files) {
    const appliedChecksum = appliedChecksums.get(file.name);
    if (appliedChecksum !== undefined) {
      if (appliedChecksum !== file.checksum) throw new MigrationChecksumMismatchError(file.name);
      skipped.push(file.name);
      continue;
    }

    try {
      await client.query('BEGIN');
      await client.query(file.sql);
      await client.query('INSERT INTO schema_migrations (name, checksum) VALUES ($1, $2)', [file.name, file.checksum]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw new MigrationFailedError(file.name, error);
    }
    applied.push(file.name);
    log(`applied ${file.name}`);
  }
  return { applied, skipped };
}

async function readMigrationFiles(directory: string): Promise<MigrationFile[]> {
  const entries = (await readdir(directory)).filter((entry) => entry.endsWith('.sql')).sort();

  const seenNumbers = new Set<string>();
  const files: MigrationFile[] = [];
  for (const name of entries) {
    const match = MIGRATION_FILE_PATTERN.exec(name);
    if (!match?.[1]) {
      throw new InvalidMigrationFilesError(`${name} does not match NNN_description.sql (lowercase, underscores).`);
    }
    if (seenNumbers.has(match[1])) {
      throw new InvalidMigrationFilesError(`Two migrations share the number ${match[1]}.`);
    }
    seenNumbers.add(match[1]);
    const sql = await readFile(join(directory, name), 'utf8');
    files.push({ name, sql, checksum: createHash('sha256').update(sql).digest('hex') });
  }
  return files;
}
