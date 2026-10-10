import { AsyncLocalStorage } from 'node:async_hooks';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Pool, PoolClient } from 'pg';
import { InvariantViolationError } from '../common/errors';
import { DATABASE_POOL } from './database-pool';

/** What a repository runs SQL on: the ambient transaction's client, or the pool. */
export type Queryable = Pick<Pool | PoolClient, 'query'>;

/**
 * The transaction boundary, carried implicitly through async calls in AsyncLocalStorage.
 *
 * - `run()` opens ONE transaction at READ COMMITTED (Postgres's default, named explicitly).
 *   Phases that need stronger guarantees take row locks (`SELECT … FOR UPDATE`) inside it
 *   rather than raising the isolation level, so conflicts block instead of failing late.
 * - A nested `run()` joins the ambient transaction; it never opens a second one or a
 *   savepoint. A failure anywhere inside aborts the whole unit: there are no partial commits.
 * - Repositories call `client()`, so the same repository code works inside and outside a unit.
 * - Never call `run()` around a network call to a third party: the transaction would hold its
 *   connection and locks for as long as that call takes.
 */
@Injectable()
export class UnitOfWork {
  private readonly logger = new Logger(UnitOfWork.name);
  private readonly storage = new AsyncLocalStorage<PoolClient>();

  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  /** The ambient transaction's client, or the pool (one statement, auto-commit) outside a unit. */
  client(): Queryable {
    return this.storage.getStore() ?? this.pool;
  }

  get isInTransaction(): boolean {
    return this.storage.getStore() !== undefined;
  }

  /** For code that must never auto-commit statement by statement (bids, the ledger). */
  requireTransaction(): PoolClient {
    const client = this.storage.getStore();
    if (!client) {
      throw new InvariantViolationError('This operation must run inside a UnitOfWork transaction.');
    }
    return client;
  }

  async run<T>(work: (client: PoolClient) => Promise<T>): Promise<T> {
    const ambient = this.storage.getStore();
    if (ambient) return work(ambient);

    const client = await this.pool.connect();
    let releaseError: Error | undefined;
    try {
      await client.query('BEGIN ISOLATION LEVEL READ COMMITTED');
      const result = await this.storage.run(client, () => work(client));
      await client.query('COMMIT');
      return result;
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch (rollbackError) {
        // The connection is in an unknown state: destroy it rather than return it to the pool.
        releaseError = rollbackError instanceof Error ? rollbackError : new Error(String(rollbackError));
        this.logger.error(`ROLLBACK failed; discarding the connection: ${releaseError.message}`);
      }
      throw error;
    } finally {
      client.release(releaseError);
    }
  }
}
