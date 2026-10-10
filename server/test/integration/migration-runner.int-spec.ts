import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Pool } from 'pg';
import {
  InvalidMigrationFilesError,
  MigrationChecksumMismatchError,
  MigrationFailedError,
  runMigrations,
} from '../../src/database/migration-runner';
import { createTestPool, prepareTestDatabase, testDatabaseUrl } from '../support/test-database';

/**
 * Each test gets its own schema (via search_path) and its own folder of migration files, so the
 * runner is exercised from scratch without touching the real test schema.
 */
describe('migration runner', () => {
  let schema: string;
  let migrationsDirectory: string;
  let pool: Pool;
  let adminPool: Pool;

  beforeAll(async () => {
    await prepareTestDatabase();
    adminPool = createTestPool({ max: 1 });
  });

  afterAll(async () => {
    await adminPool.end();
  });

  beforeEach(async () => {
    schema = `migration_test_${randomUUID().replaceAll('-', '')}`;
    await adminPool.query(`CREATE SCHEMA ${schema}`);
    pool = new Pool({ connectionString: testDatabaseUrl(), max: 2, options: `-c search_path=${schema}` });
    migrationsDirectory = await mkdtemp(join(tmpdir(), 'art-auction-migrations-'));
  });

  afterEach(async () => {
    await pool.end();
    await adminPool.query(`DROP SCHEMA ${schema} CASCADE`);
    await rm(migrationsDirectory, { recursive: true, force: true });
  });

  async function writeMigration(name: string, sql: string): Promise<void> {
    await writeFile(join(migrationsDirectory, name), sql);
  }

  async function tableExists(table: string): Promise<boolean> {
    const { rows } = await adminPool.query<{ oid: string | null }>('SELECT to_regclass($1)::text AS oid', [
      `${schema}.${table}`,
    ]);
    return rows[0]?.oid !== null;
  }

  async function recordedMigrations(): Promise<string[]> {
    const { rows } = await adminPool.query<{ name: string }>(`SELECT name FROM ${schema}.schema_migrations ORDER BY name`);
    return rows.map((row) => row.name);
  }

  it('applies new migrations in numeric order and records each one', async () => {
    // 002 depends on 001, so the wrong order would fail.
    await writeMigration('002_add_beta.sql', 'CREATE TABLE beta (alpha_id INT REFERENCES alpha (id));');
    await writeMigration('001_add_alpha.sql', 'CREATE TABLE alpha (id INT PRIMARY KEY);');

    const result = await runMigrations(pool, { migrationsDirectory });

    expect(result).toEqual({ applied: ['001_add_alpha.sql', '002_add_beta.sql'], skipped: [] });
    expect(await tableExists('alpha')).toBe(true);
    expect(await tableExists('beta')).toBe(true);
    expect(await recordedMigrations()).toEqual(['001_add_alpha.sql', '002_add_beta.sql']);
  });

  it('skips migrations that were already applied and applies only the new ones', async () => {
    // Not idempotent SQL on purpose: running it twice would fail with "already exists".
    await writeMigration('001_add_alpha.sql', 'CREATE TABLE alpha (id INT PRIMARY KEY);');
    await runMigrations(pool, { migrationsDirectory });

    expect(await runMigrations(pool, { migrationsDirectory })).toEqual({ applied: [], skipped: ['001_add_alpha.sql'] });

    await writeMigration('002_add_beta.sql', 'CREATE TABLE beta (id INT);');
    expect(await runMigrations(pool, { migrationsDirectory })).toEqual({
      applied: ['002_add_beta.sql'],
      skipped: ['001_add_alpha.sql'],
    });
  });

  it('rolls a failing migration back completely and stops before later ones', async () => {
    await writeMigration('001_add_alpha.sql', 'CREATE TABLE alpha (id INT PRIMARY KEY);');
    // The first two statements succeed; the third fails. None of it may survive.
    await writeMigration(
      '002_add_gamma.sql',
      'CREATE TABLE gamma (id INT); INSERT INTO alpha (id) VALUES (1); SELECT * FROM table_that_does_not_exist;',
    );
    await writeMigration('003_add_delta.sql', 'CREATE TABLE delta (id INT);');

    const failure = runMigrations(pool, { migrationsDirectory });

    await expect(failure).rejects.toBeInstanceOf(MigrationFailedError);
    await expect(failure).rejects.toMatchObject({ migration: '002_add_gamma.sql' });
    expect(await tableExists('gamma')).toBe(false);
    expect((await adminPool.query(`SELECT count(*) AS count FROM ${schema}.alpha`)).rows[0]).toEqual({ count: 0 });
    expect(await tableExists('delta')).toBe(false);
    expect(await recordedMigrations()).toEqual(['001_add_alpha.sql']);

    // Once fixed, the run picks up where it stopped.
    await writeMigration('002_add_gamma.sql', 'CREATE TABLE gamma (id INT);');
    expect(await runMigrations(pool, { migrationsDirectory })).toEqual({
      applied: ['002_add_gamma.sql', '003_add_delta.sql'],
      skipped: ['001_add_alpha.sql'],
    });
  });

  it('refuses to continue when an applied migration was edited', async () => {
    await writeMigration('001_add_alpha.sql', 'CREATE TABLE alpha (id INT PRIMARY KEY);');
    await runMigrations(pool, { migrationsDirectory });

    await writeMigration('001_add_alpha.sql', 'CREATE TABLE alpha (id BIGINT PRIMARY KEY);');

    await expect(runMigrations(pool, { migrationsDirectory })).rejects.toBeInstanceOf(MigrationChecksumMismatchError);
  });

  it.each([
    ['a badly named file', ['1_add_alpha.sql']],
    ['two files with the same number', ['001_add_alpha.sql', '001_add_beta.sql']],
  ])('rejects %s before running anything', async (_description, names) => {
    for (const name of names) await writeMigration(name, 'CREATE TABLE never_created (id INT);');

    await expect(runMigrations(pool, { migrationsDirectory })).rejects.toBeInstanceOf(InvalidMigrationFilesError);
    expect(await tableExists('schema_migrations')).toBe(false);
  });

  it('applies the real migrations to the test database, and re-running is a no-op', async () => {
    const realPool = createTestPool({ max: 1 });
    try {
      const result = await runMigrations(realPool);
      expect(result.applied).toEqual([]);
      expect(result.skipped).toContain('001_catalog.sql');
    } finally {
      await realPool.end();
    }
  });
});
