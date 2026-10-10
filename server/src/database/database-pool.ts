import { Pool } from 'pg';
import { databaseTypes } from './database-types';

export const DATABASE_POOL = Symbol('DATABASE_POOL');

export interface DatabasePoolOptions {
  readonly connectionString: string;
  readonly max?: number;
  readonly applicationName?: string;
}

export function createDatabasePool(options: DatabasePoolOptions): Pool {
  return new Pool({
    connectionString: options.connectionString,
    max: options.max ?? 10,
    application_name: options.applicationName ?? 'art-auction',
    types: databaseTypes,
    connectionTimeoutMillis: 5_000,
  });
}
