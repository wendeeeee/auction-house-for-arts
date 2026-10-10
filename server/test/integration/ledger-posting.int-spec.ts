import { randomUUID } from 'node:crypto';
import type { TestingModule } from '@nestjs/testing';
import type { Pool, PoolClient } from 'pg';
import { Clock } from '../../src/common/clock';
import { ErrorCode } from '../../src/common/errors';
import { UnitOfWork } from '../../src/database';
import { LedgerModule, LedgerService, Posting } from '../../src/modules/ledger';
import { insertUser } from '../support/catalog-fixtures';
import { createTestContext } from '../support/create-test-context';
import { FakeClock } from '../support/fake-clock';
import { createTestPool, prepareTestDatabase, truncateAllTables } from '../support/test-database';

const POSTED_AT = new Date('2026-01-15T14:00:00.000Z');

interface StoredEntry {
  kind: string;
  owner_user_id: string | null;
  amount_cents: number;
}

describe('ledger posting', () => {
  const clock = new FakeClock(POSTED_AT);
  let pool: Pool;
  let moduleRef: TestingModule;
  let secondModuleRef: TestingModule;
  let ledger: LedgerService;
  let unitOfWork: UnitOfWork;
  let sellerUserId: string;
  let artistUserId: string;

  const startLedger = (): Promise<TestingModule> =>
    createTestContext({ imports: [LedgerModule], configure: (builder) => builder.overrideProvider(Clock).useValue(clock) });

  beforeAll(async () => {
    await prepareTestDatabase();
    pool = createTestPool();
    moduleRef = await startLedger();
    // A second app instance with its own pool, for the concurrency test.
    secondModuleRef = await startLedger();
    ledger = moduleRef.get(LedgerService, { strict: false });
    unitOfWork = moduleRef.get(UnitOfWork, { strict: false });
  });

  afterAll(async () => {
    await moduleRef.close();
    await secondModuleRef.close();
    await pool.end();
  });

  beforeEach(async () => {
    await truncateAllTables(pool);
    clock.setTo(POSTED_AT);
    sellerUserId = await insertUser(pool);
    artistUserId = await insertUser(pool);
  });

  function salePosting(purchaseId: string = randomUUID()): Posting {
    return {
      purchaseId,
      memo: 'Sale of “Harbour”',
      lines: [
        { account: { kind: 'platform_cash', ownerUserId: null }, amountCents: 1_000_00 },
        { account: { kind: 'platform_revenue', ownerUserId: null }, amountCents: -100_00 },
        { account: { kind: 'artist_payable', ownerUserId: artistUserId }, amountCents: -50_00 },
        { account: { kind: 'seller_payable', ownerUserId: sellerUserId }, amountCents: -850_00 },
      ],
    };
  }

  async function storedEntries(): Promise<StoredEntry[]> {
    const { rows } = await pool.query<StoredEntry>(
      `SELECT account.kind, account.owner_user_id, entry.amount_cents
         FROM ledger_entries entry JOIN ledger_accounts account ON account.id = entry.account_id
        ORDER BY entry.id`,
    );
    return rows;
  }

  const count = async (table: string): Promise<number> =>
    (await pool.query<{ count: number }>(`SELECT count(*) AS count FROM ${table}`)).rows[0]!.count;

  /** Writes ledger rows directly, the way a buggy script or a manual fix would, bypassing post(). */
  async function insertRawTransaction(client: PoolClient, amountsCents: readonly number[]): Promise<void> {
    const {
      rows: [cashAccount],
    } = await client.query<{ id: string }>(
      `INSERT INTO ledger_accounts (kind, owner_user_id) VALUES ('platform_cash', NULL)
       ON CONFLICT ON CONSTRAINT ledger_accounts_one_per_kind_and_owner DO UPDATE SET kind = EXCLUDED.kind
       RETURNING id`,
    );
    const {
      rows: [transaction],
    } = await client.query<{ id: string }>(
      `INSERT INTO ledger_transactions (purchase_id, memo, created_at) VALUES ($1, 'raw insert', now()) RETURNING id`,
      [randomUUID()],
    );
    for (const amountCents of amountsCents) {
      await client.query('INSERT INTO ledger_entries (transaction_id, account_id, amount_cents) VALUES ($1, $2, $3)', [
        transaction!.id,
        cashAccount!.id,
        amountCents,
      ]);
    }
  }

  async function inRawTransaction(work: (client: PoolClient) => Promise<void>): Promise<void> {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      try {
        await work(client);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    } finally {
      client.release();
    }
  }

  describe('post()', () => {
    it('writes one balanced transaction, creating the accounts it needs', async () => {
      const purchaseId = randomUUID();
      await unitOfWork.run(() => ledger.post(salePosting(purchaseId)));

      expect(await storedEntries()).toEqual([
        { kind: 'platform_cash', owner_user_id: null, amount_cents: 1_000_00 },
        { kind: 'platform_revenue', owner_user_id: null, amount_cents: -100_00 },
        { kind: 'artist_payable', owner_user_id: artistUserId, amount_cents: -50_00 },
        { kind: 'seller_payable', owner_user_id: sellerUserId, amount_cents: -850_00 },
      ]);
      const { rows } = await pool.query('SELECT purchase_id, memo, created_at FROM ledger_transactions');
      expect(rows).toEqual([{ purchase_id: purchaseId, memo: 'Sale of “Harbour”', created_at: POSTED_AT }]);
    });

    it('reuses an existing account instead of creating a second one', async () => {
      await unitOfWork.run(() => ledger.post(salePosting()));
      await unitOfWork.run(() => ledger.post(salePosting()));

      expect(await count('ledger_accounts')).toBe(4);
      expect(await count('ledger_transactions')).toBe(2);
    });

    it('posts a purchase only once: a second posting fails and writes nothing', async () => {
      const purchaseId = randomUUID();
      await unitOfWork.run(() => ledger.post(salePosting(purchaseId)));

      await expect(unitOfWork.run(() => ledger.post(salePosting(purchaseId)))).rejects.toMatchObject({
        code: ErrorCode.PURCHASE_ALREADY_POSTED,
      });
      expect(await count('ledger_transactions')).toBe(1);
      expect(await count('ledger_entries')).toBe(4);
    });

    it('rejects an unbalanced posting before writing anything', async () => {
      const posting = salePosting();
      const unbalanced: Posting = { ...posting, lines: [...posting.lines.slice(0, 3)] };

      await expect(unitOfWork.run(() => ledger.post(unbalanced))).rejects.toMatchObject({
        code: ErrorCode.INVALID_LEDGER_POSTING,
      });
      expect(await count('ledger_transactions')).toBe(0);
    });

    it('refuses to run outside a unit of work, so a posting can never commit line by line', async () => {
      await expect(ledger.post(salePosting())).rejects.toMatchObject({ code: ErrorCode.INVARIANT_VIOLATION });
      expect(await count('ledger_entries')).toBe(0);
    });

    it('lets two concurrent postings create the same new accounts without a deadlock or a duplicate', async () => {
      const secondLedger = secondModuleRef.get(LedgerService, { strict: false });
      const secondUnitOfWork = secondModuleRef.get(UnitOfWork, { strict: false });

      await Promise.all([
        unitOfWork.run(() => ledger.post(salePosting())),
        secondUnitOfWork.run(() => secondLedger.post(salePosting())),
      ]);

      expect(await count('ledger_accounts')).toBe(4);
      expect(await count('ledger_transactions')).toBe(2);
    });
  });

  describe('recordSale()', () => {
    it('splits a resale (10% fee, 5% royalty) and credits the seller and the artist', async () => {
      const recorded = await unitOfWork.run(() =>
        ledger.recordSale({
          purchaseId: randomUUID(),
          memo: 'Sale of “Harbour”',
          hammerPriceCents: 1_234_57,
          sellerUserId,
          artistUserId,
          artistRoyaltyBps: 500,
        }),
      );

      expect(recorded.split).toEqual({ platformFeeCents: 123_45, artistRoyaltyCents: 61_72, sellerProceedsCents: 1_049_40 });
      const entries = await storedEntries();
      expect(entries.reduce((sum, entry) => sum + entry.amount_cents, 0)).toBe(0);
      expect(entries).toContainEqual({ kind: 'artist_payable', owner_user_id: artistUserId, amount_cents: -61_72 });
      expect(entries).toContainEqual({ kind: 'seller_payable', owner_user_id: sellerUserId, amount_cents: -1_049_40 });
    });

    it('pays no royalty on a primary sale: the artist is paid as the seller', async () => {
      await unitOfWork.run(() =>
        ledger.recordSale({
          purchaseId: randomUUID(),
          memo: 'Sale of “Harbour”',
          hammerPriceCents: 1_000_00,
          sellerUserId: artistUserId,
          artistUserId,
          artistRoyaltyBps: 500,
        }),
      );

      expect(await storedEntries()).toEqual([
        { kind: 'platform_cash', owner_user_id: null, amount_cents: 1_000_00 },
        { kind: 'platform_revenue', owner_user_id: null, amount_cents: -100_00 },
        { kind: 'seller_payable', owner_user_id: artistUserId, amount_cents: -900_00 },
      ]);
    });
  });

  describe('the database’s own guarantees (for writes that bypass post())', () => {
    it('rejects an unbalanced transaction at commit (the deferred zero-sum trigger)', async () => {
      await expect(inRawTransaction((client) => insertRawTransaction(client, [500_00, -499_99]))).rejects.toMatchObject({
        constraint: 'ledger_entries_balanced',
      });
      expect(await count('ledger_entries')).toBe(0);
      expect(await count('ledger_transactions')).toBe(0);
    });

    it('accepts entries that balance only once the last one is in, because the check waits for commit', async () => {
      await inRawTransaction((client) => insertRawTransaction(client, [500_00, -300_00, -200_00]));
      expect(await count('ledger_entries')).toBe(3);
    });

    it('keeps history append-only: entries and transactions cannot be updated or deleted', async () => {
      await unitOfWork.run(() => ledger.post(salePosting()));

      await expect(pool.query('UPDATE ledger_entries SET amount_cents = amount_cents * 2')).rejects.toMatchObject({
        constraint: 'ledger_append_only',
      });
      await expect(pool.query('DELETE FROM ledger_entries')).rejects.toMatchObject({ constraint: 'ledger_append_only' });
      await expect(pool.query(`UPDATE ledger_transactions SET memo = 'edited'`)).rejects.toMatchObject({
        constraint: 'ledger_append_only',
      });
      expect(await count('ledger_entries')).toBe(4);
    });

    it('allows only one platform account of each kind, even though its owner is NULL', async () => {
      await pool.query(`INSERT INTO ledger_accounts (kind, owner_user_id) VALUES ('platform_cash', NULL)`);
      await expect(
        pool.query(`INSERT INTO ledger_accounts (kind, owner_user_id) VALUES ('platform_cash', NULL)`),
      ).rejects.toMatchObject({ constraint: 'ledger_accounts_one_per_kind_and_owner' });
    });

    it('requires an owner on a payable and forbids one on a platform account', async () => {
      await expect(
        pool.query(`INSERT INTO ledger_accounts (kind, owner_user_id) VALUES ('seller_payable', NULL)`),
      ).rejects.toMatchObject({ constraint: 'ledger_accounts_owner_matches_kind' });
      await expect(
        pool.query(`INSERT INTO ledger_accounts (kind, owner_user_id) VALUES ('platform_cash', $1)`, [sellerUserId]),
      ).rejects.toMatchObject({ constraint: 'ledger_accounts_owner_matches_kind' });
    });
  });
});
