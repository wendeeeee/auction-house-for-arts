import { loadConfiguration } from '../../config';
import { createDatabasePool } from '../database-pool';
import { isCatalogEmpty, seedCatalog } from './seed-catalog';

/**
 * `npm run seed`: inserts any missing demo rows.
 * `npm run seed:if-empty`: does nothing if any user exists (used by `npm start`, so a database
 * you have been using is never touched).
 */
async function main(): Promise<void> {
  const onlyIfEmpty = process.argv.includes('--if-empty');
  const config = loadConfiguration(process.env);
  const pool = createDatabasePool({ connectionString: config.database.url, max: 1, applicationName: 'art-auction-seed' });
  try {
    if (onlyIfEmpty && !(await isCatalogEmpty(pool))) {
      console.log('seed: database already has data, skipping');
      return;
    }
    const result = await seedCatalog(pool);
    console.log(
      `seed: inserted ${result.usersInserted} users, ${result.artistsInserted} artists, ${result.artworksInserted} artworks`,
    );
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
