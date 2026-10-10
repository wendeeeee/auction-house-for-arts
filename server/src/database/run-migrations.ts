import { loadConfiguration } from '../config';
import { createDatabasePool } from './database-pool';
import { runMigrations } from './migration-runner';

/** `npm run migrate`: applies pending migrations to DATABASE_URL and exits. */
async function main(): Promise<void> {
  const config = loadConfiguration(process.env);
  const pool = createDatabasePool({ connectionString: config.database.url, max: 1, applicationName: 'art-auction-migrate' });
  try {
    const result = await runMigrations(pool, { log: (message) => console.log(message) });
    console.log(`migrations: ${result.applied.length} applied, ${result.skipped.length} already applied`);
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
