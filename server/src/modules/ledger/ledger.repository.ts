import { Injectable } from '@nestjs/common';
import { InvariantViolationError } from '../../common/errors';
import { UnitOfWork } from '../../database';
import { EarningsEntry, LedgerAccountReference, UserPayableAccountKind } from './ledger.types';

export const ONE_TRANSACTION_PER_PURCHASE_CONSTRAINT = 'ledger_transactions_one_per_purchase';

export interface NewLedgerEntry {
  readonly accountId: string;
  readonly amountCents: number;
}

export interface AccountBalance {
  readonly kind: UserPayableAccountKind;
  /** Signed, debits positive: a payable the platform owes is negative. */
  readonly balanceCents: number;
}

interface EarningsEntryRow {
  purchase_id: string;
  kind: UserPayableAccountKind;
  amount_cents: number;
  memo: string;
  created_at: Date;
}

/** Stable key for an account reference: a platform account has no owner. */
export const accountKey = (account: LedgerAccountReference): string => `${account.kind}:${account.ownerUserId ?? ''}`;

/** Owns `ledger_accounts`, `ledger_transactions`, and `ledger_entries`. Every write needs a transaction. */
@Injectable()
export class LedgerRepository {
  constructor(private readonly unitOfWork: UnitOfWork) {}

  /**
   * The account IDs for these references, creating missing accounts. Keyed by `accountKey`.
   *
   * Accounts are created in a fixed order (sorted by key). Two postings that both create the
   * same new accounts then wait on each other's unique-key insert in the same order, instead of
   * each holding one and waiting for the other (a deadlock).
   */
  async findOrCreateAccountIds(accounts: readonly LedgerAccountReference[]): Promise<Map<string, string>> {
    const client = this.unitOfWork.requireTransaction();
    const uniqueAccounts = [...new Map(accounts.map((account) => [accountKey(account), account])).entries()].sort(
      ([firstKey], [secondKey]) => (firstKey < secondKey ? -1 : firstKey > secondKey ? 1 : 0),
    );

    const idsByKey = new Map<string, string>();
    for (const [key, account] of uniqueAccounts) {
      // ON CONFLICT DO NOTHING returns no row when the account exists, so look it up after.
      // At READ COMMITTED the SELECT is a new snapshot, so it sees an account another
      // transaction committed while this insert waited on its key.
      await client.query(
        `INSERT INTO ledger_accounts (kind, owner_user_id) VALUES ($1, $2)
         ON CONFLICT ON CONSTRAINT ledger_accounts_one_per_kind_and_owner DO NOTHING`,
        [account.kind, account.ownerUserId],
      );
      const ownerCondition = account.ownerUserId === null ? 'owner_user_id IS NULL' : 'owner_user_id = $2';
      const parameters = account.ownerUserId === null ? [account.kind] : [account.kind, account.ownerUserId];
      const { rows } = await client.query<{ id: string }>(
        `SELECT id FROM ledger_accounts WHERE kind = $1 AND ${ownerCondition}`,
        parameters,
      );
      const id = rows[0]?.id;
      if (!id) throw new InvariantViolationError('A ledger account was neither created nor found.', { key });
      idsByKey.set(key, id);
    }
    return idsByKey;
  }

  /** Fails with a unique violation of ONE_TRANSACTION_PER_PURCHASE_CONSTRAINT if the purchase was posted already. */
  async insertTransaction(transaction: { purchaseId: string; memo: string; createdAt: Date }): Promise<string> {
    const { rows } = await this.unitOfWork
      .requireTransaction()
      .query<{ id: string }>('INSERT INTO ledger_transactions (purchase_id, memo, created_at) VALUES ($1, $2, $3) RETURNING id', [
        transaction.purchaseId,
        transaction.memo,
        transaction.createdAt,
      ]);
    const id = rows[0]?.id;
    if (!id) throw new InvariantViolationError('INSERT … RETURNING returned no ledger transaction.');
    return id;
  }

  async insertEntries(transactionId: string, entries: readonly NewLedgerEntry[]): Promise<void> {
    const parameters: unknown[] = [transactionId];
    const valueLists = entries.map((entry) => {
      parameters.push(entry.accountId, entry.amountCents);
      return `($1, $${parameters.length - 1}, $${parameters.length})`;
    });
    await this.unitOfWork
      .requireTransaction()
      .query(`INSERT INTO ledger_entries (transaction_id, account_id, amount_cents) VALUES ${valueLists.join(', ')}`, parameters);
  }

  /** Balances of the user's payable accounts. `sum` of BIGINT is NUMERIC, so it is cast back for the BIGINT parser. */
  async listPayableBalances(ownerUserId: string): Promise<AccountBalance[]> {
    const { rows } = await this.unitOfWork.client().query<{ kind: UserPayableAccountKind; balance_cents: number }>(
      `SELECT account.kind, COALESCE(sum(entry.amount_cents), 0)::bigint AS balance_cents
         FROM ledger_accounts account
         LEFT JOIN ledger_entries entry ON entry.account_id = account.id
        WHERE account.owner_user_id = $1
        GROUP BY account.kind`,
      [ownerUserId],
    );
    return rows.map((row) => ({ kind: row.kind, balanceCents: row.balance_cents }));
  }

  async listRecentPayableEntries(ownerUserId: string, limit: number): Promise<EarningsEntry[]> {
    const { rows } = await this.unitOfWork.client().query<EarningsEntryRow>(
      `SELECT posted.purchase_id, account.kind, entry.amount_cents, posted.memo, posted.created_at
         FROM ledger_entries entry
         JOIN ledger_accounts account ON account.id = entry.account_id
         JOIN ledger_transactions posted ON posted.id = entry.transaction_id
        WHERE account.owner_user_id = $1
        ORDER BY posted.created_at DESC, entry.id DESC
        LIMIT $2`,
      [ownerUserId, limit],
    );
    return rows.map((row) => ({
      purchaseId: row.purchase_id,
      accountKind: row.kind,
      // A payable is credit-normal: a credit (negative) is money earned.
      earnedCents: -row.amount_cents,
      memo: row.memo,
      postedAt: row.created_at,
    }));
  }
}
