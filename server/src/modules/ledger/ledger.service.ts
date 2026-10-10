import { Inject, Injectable } from '@nestjs/common';
import { Clock } from '../../common/clock';
import { AuthenticatedUser } from '../../common/identity';
import { APP_CONFIG, AppConfig } from '../../config';
import { UnitOfWork, isUniqueViolation } from '../../database';
import { resolveSaleType } from '../artworks';
import { PurchaseAlreadyPostedError } from './ledger.errors';
import { LedgerRepository, ONE_TRANSACTION_PER_PURCHASE_CONSTRAINT, accountKey } from './ledger.repository';
import { Earnings, Posting, RecordedSale, SaleToRecord } from './ledger.types';
import { assertPostingBalances } from './posting/posting-validation';
import { computeSalePostingLines, computeSaleProceedsSplit } from './posting/sale-proceeds-split';

const RECENT_EARNINGS_LIMIT = 50;

/**
 * The ledger's public API. `post()` is the only code that writes ledger rows, and balances are
 * sums of those rows, so it is the only way any balance changes.
 */
@Injectable()
export class LedgerService {
  constructor(
    private readonly unitOfWork: UnitOfWork,
    private readonly ledgerRepository: LedgerRepository,
    private readonly clock: Clock,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /**
   * Writes one balanced transaction. Must run inside the caller's unit of work, so the money
   * moves in the same commit as the change that caused it (a purchase marked paid). Returns the
   * transaction ID.
   */
  async post(posting: Posting): Promise<string> {
    this.unitOfWork.requireTransaction();
    assertPostingBalances(posting.lines);

    const accountIdsByKey = await this.ledgerRepository.findOrCreateAccountIds(posting.lines.map((line) => line.account));
    let transactionId: string;
    try {
      transactionId = await this.ledgerRepository.insertTransaction({
        purchaseId: posting.purchaseId,
        memo: posting.memo,
        createdAt: this.clock.now(),
      });
    } catch (error) {
      if (isUniqueViolation(error, ONE_TRANSACTION_PER_PURCHASE_CONSTRAINT)) throw new PurchaseAlreadyPostedError(posting.purchaseId);
      throw error;
    }
    await this.ledgerRepository.insertEntries(
      transactionId,
      posting.lines.map((line) => ({ accountId: accountIdsByKey.get(accountKey(line.account))!, amountCents: line.amountCents })),
    );
    return transactionId;
  }

  /** Splits a paid sale (see computeSaleProceedsSplit) and posts it. Inside the caller's unit of work. */
  async recordSale(sale: SaleToRecord): Promise<RecordedSale> {
    const split = computeSaleProceedsSplit({
      hammerPriceCents: sale.hammerPriceCents,
      platformFeeBps: this.config.ledger.platformFeeBps,
      artistRoyaltyBps: sale.artistRoyaltyBps,
      // Decided by who sold, not who owns the work now: ownership moves in this same transaction.
      saleType: resolveSaleType(sale.sellerUserId, sale.artistUserId),
    });
    const transactionId = await this.post({
      purchaseId: sale.purchaseId,
      memo: sale.memo,
      lines: computeSalePostingLines(split, sale),
    });
    return { transactionId, split };
  }

  async getEarnings(user: AuthenticatedUser): Promise<Earnings> {
    const [balances, recentEntries] = await Promise.all([
      this.ledgerRepository.listPayableBalances(user.id),
      this.ledgerRepository.listRecentPayableEntries(user.id, RECENT_EARNINGS_LIMIT),
    ]);
    // Payables are credit-normal: a balance of −$850 means the platform owes the user $850.
    const owedCents = (kind: 'seller_payable' | 'artist_payable'): number => {
      const balanceCents = balances.find((balance) => balance.kind === kind)?.balanceCents ?? 0;
      return balanceCents === 0 ? 0 : -balanceCents;
    };
    return {
      sellerProceedsCents: owedCents('seller_payable'),
      artistRoyaltiesCents: owedCents('artist_payable'),
      recentEntries,
    };
  }
}
