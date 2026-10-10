import { loadConfiguration } from '../config';
import { recreateDatabase } from './database-administration';

/** `npm run db:reset`: drops and recreates DATABASE_URL's database (empty; run `migrate` next). */
async function main(): Promise<void> {
  const config = loadConfiguration(process.env);
  if (config.nodeEnvironment === 'production') {
    throw new Error('Refusing to reset a database when NODE_ENV=production.');
  }
  await recreateDatabase(config.database.url);
  console.log(`database reset: ${new URL(config.database.url).pathname.slice(1)}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
