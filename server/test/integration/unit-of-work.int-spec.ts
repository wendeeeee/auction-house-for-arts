import type { Pool } from 'pg';
import { ErrorCode } from '../../src/common/errors';
import { UnitOfWork } from '../../src/database/unit-of-work';
import { createTestPool, prepareTestDatabase, truncateAllTables } from '../support/test-database';

describe('UnitOfWork', () => {
  let pool: Pool;
  let unitOfWork: UnitOfWork;

  beforeAll(async () => {
    await prepareTestDatabase();
    pool = createTestPool();
    unitOfWork = new UnitOfWork(pool);
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await truncateAllTables(pool);
  });

  /** Inserts through the ambient client, exactly as a repository would. */
  async function insertUser(handle: string): Promise<void> {
    await unitOfWork.client().query('INSERT INTO users (display_name, handle) VALUES ($1, $1)', [handle]);
  }

  /** Reads through the pool, i.e. from a different connection: sees only committed data. */
  async function committedHandles(): Promise<string[]> {
    const { rows } = await pool.query<{ handle: string }>('SELECT handle FROM users ORDER BY handle');
    return rows.map((row) => row.handle);
  }

  it('commits the work when the function resolves', async () => {
    const result = await unitOfWork.run(async () => {
      await insertUser('first_user');
      await insertUser('second_user');
      return 'done';
    });

    expect(result).toBe('done');
    expect(await committedHandles()).toEqual(['first_user', 'second_user']);
  });

  it('keeps uncommitted work invisible to other connections until it commits', async () => {
    await unitOfWork.run(async () => {
      await insertUser('pending_user');
      expect(await committedHandles()).toEqual([]);
    });
    expect(await committedHandles()).toEqual(['pending_user']);
  });

  it('rolls everything back and rethrows when the function throws', async () => {
    const failure = new Error('business rule failed after the insert');

    await expect(
      unitOfWork.run(async () => {
        await insertUser('rolled_back_user');
        throw failure;
      }),
    ).rejects.toBe(failure);

    expect(await committedHandles()).toEqual([]);
  });

  it('makes a nested run join the outer transaction instead of committing on its own', async () => {
    await expect(
      unitOfWork.run(async (outerClient) => {
        await insertUser('outer_user');
        await unitOfWork.run(async (innerClient) => {
          expect(innerClient).toBe(outerClient);
          await insertUser('inner_user');
        });
        // The inner run has returned, but nothing is committed yet.
        expect(await committedHandles()).toEqual([]);
        throw new Error('outer fails after the inner run finished');
      }),
    ).rejects.toThrow('outer fails');

    expect(await committedHandles()).toEqual([]);
  });

  it('uses the pool outside a unit, and refuses requireTransaction() there', async () => {
    expect(unitOfWork.isInTransaction).toBe(false);
    expect(unitOfWork.client()).toBe(pool);
    expect(() => unitOfWork.requireTransaction()).toThrow(
      expect.objectContaining({ code: ErrorCode.INVARIANT_VIOLATION }),
    );

    await unitOfWork.run(async (client) => {
      expect(unitOfWork.isInTransaction).toBe(true);
      expect(unitOfWork.requireTransaction()).toBe(client);
    });
  });

  it('returns its connection to the pool after both commit and rollback', async () => {
    await unitOfWork.run(async () => insertUser('kept_user'));
    await unitOfWork.run(async () => Promise.reject(new Error('fail'))).catch(() => undefined);

    expect(pool.totalCount - pool.idleCount).toBe(0);
  });
});
