import { Client } from 'pg';

/**
 * Database-level operations (create, drop) must run from a connection to a *different*
 * database, so these connect to the server's `postgres` maintenance database.
 */
function maintenanceConnectionString(databaseUrl: string): { connectionString: string; databaseName: string } {
  const url = new URL(databaseUrl);
  const databaseName = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!databaseName) throw new Error(`No database name in ${url.origin}.`);
  url.pathname = '/postgres';
  return { connectionString: url.toString(), databaseName };
}

/** Double-quotes an identifier; names come from our own config, but quoting keeps them literal. */
function quoteIdentifier(name: string): string {
  return `"${name.replaceAll('"', '""')}"`;
}

async function withMaintenanceClient<T>(connectionString: string, work: (client: Client) => Promise<T>): Promise<T> {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    return await work(client);
  } finally {
    await client.end();
  }
}

export async function createDatabaseIfMissing(databaseUrl: string): Promise<boolean> {
  const { connectionString, databaseName } = maintenanceConnectionString(databaseUrl);
  return withMaintenanceClient(connectionString, async (client) => {
    const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [databaseName]);
    if (rowCount) return false;
    try {
      await client.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`);
    } catch (error) {
      // Another process created it between the check and the CREATE.
      if ((error as { code?: string }).code !== '42P04') throw error;
      return false;
    }
    return true;
  });
}

/** Drops (disconnecting any sessions) and recreates the database. Development and tests only. */
export async function recreateDatabase(databaseUrl: string): Promise<void> {
  const { connectionString, databaseName } = maintenanceConnectionString(databaseUrl);
  await withMaintenanceClient(connectionString, async (client) => {
    await client.query(`DROP DATABASE IF EXISTS ${quoteIdentifier(databaseName)} WITH (FORCE)`);
    await client.query(`CREATE DATABASE ${quoteIdentifier(databaseName)}`);
  });
}
