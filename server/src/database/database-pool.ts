import { Pool } from 'pg';
import { databaseTypes } from './database-types';

/** Injection token for the shared `pg` Pool. */
export const DATABASE_POOL = Symbol('DATABASE_POOL');

export interface DatabasePoolOptions {
  readonly connectionString: string;
  readonly max?: number;
  readonly applicationName?: string;
}

/** The one place a Pool is configured, used by the app, the CLIs (migrate, seed), and tests. */
export function createDatabasePool(options: DatabasePoolOptions): Pool {
  return new Pool({
    connectionString: options.connectionString,
    max: options.max ?? 10,
    application_name: options.applicationName ?? 'art-auction',
    types: databaseTypes,
    // Fail a request quickly when the database is unreachable instead of hanging it.
    connectionTimeoutMillis: 5_000,
  });
}
