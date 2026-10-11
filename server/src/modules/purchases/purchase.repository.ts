import { Injectable } from '@nestjs/common';
import { InvariantViolationError } from '../../common/errors';
import { UnitOfWork } from '../../database';
import type { PaymentCurrency } from '../payments';
import { Purchase, PurchaseStatus } from './purchases.types';

interface PurchaseRow {
  id: string;
  auction_id: string;
  buyer_user_id: string;
  amount_cents: number;
  currency: PaymentCurrency;
  status: PurchaseStatus;
  provider_session_id: string | null;
  created_at: Date;
  paid_at: Date | null;
}

const PURCHASE_COLUMNS = 'id, auction_id, buyer_user_id, amount_cents, currency, status, provider_session_id, created_at, paid_at';

export interface NewPurchase {
  readonly auctionId: string;
  readonly buyerUserId: string;
  readonly amountCents: number;
  readonly currency: PaymentCurrency;
  readonly createdAt: Date;
}

/** Owns the `purchases` table. */
@Injectable()
export class PurchaseRepository {
  constructor(private readonly unitOfWork: UnitOfWork) {}

  /** The auction's purchase, created on first call; concurrent first calls get the same row. */
  async findOrCreate(purchase: NewPurchase): Promise<Purchase> {
    const client = this.unitOfWork.client();
    await client.query(
      `INSERT INTO purchases (auction_id, buyer_user_id, amount_cents, currency, created_at)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT ON CONSTRAINT purchases_one_per_auction DO NOTHING`,
      [purchase.auctionId, purchase.buyerUserId, purchase.amountCents, purchase.currency, purchase.createdAt],
    );
    const existing = await this.findByAuctionId(purchase.auctionId);
    if (!existing) throw new InvariantViolationError('A purchase was neither created nor found.', { auctionId: purchase.auctionId });
    return existing;
  }

  async findByAuctionId(auctionId: string): Promise<Purchase | null> {
    const { rows } = await this.unitOfWork
      .client()
      .query<PurchaseRow>(`SELECT ${PURCHASE_COLUMNS} FROM purchases WHERE auction_id = $1`, [auctionId]);
    return rows[0] ? toPurchase(rows[0]) : null;
  }

  async findByAuctionIds(auctionIds: readonly string[]): Promise<Purchase[]> {
    if (auctionIds.length === 0) return [];
    const { rows } = await this.unitOfWork
      .client()
      .query<PurchaseRow>(`SELECT ${PURCHASE_COLUMNS} FROM purchases WHERE auction_id = ANY($1::uuid[])`, [auctionIds]);
    return rows.map(toPurchase);
  }

  async findById(purchaseId: string): Promise<Purchase | null> {
    const { rows } = await this.unitOfWork
      .client()
      .query<PurchaseRow>(`SELECT ${PURCHASE_COLUMNS} FROM purchases WHERE id = $1`, [purchaseId]);
    return rows[0] ? toPurchase(rows[0]) : null;
  }

  async lockById(purchaseId: string): Promise<Purchase | null> {
    const { rows } = await this.unitOfWork
      .requireTransaction()
      .query<PurchaseRow>(`SELECT ${PURCHASE_COLUMNS} FROM purchases WHERE id = $1 FOR UPDATE`, [purchaseId]);
    return rows[0] ? toPurchase(rows[0]) : null;
  }

  /** Compare-and-set: false when another request attached a session first, or the purchase was paid. */
  async attachSession(purchaseId: string, previousSessionId: string | null, sessionId: string): Promise<boolean> {
    const { rowCount } = await this.unitOfWork.client().query(
      `UPDATE purchases SET provider_session_id = $3
        WHERE id = $1 AND status = 'pending' AND provider_session_id IS NOT DISTINCT FROM $2`,
      [purchaseId, previousSessionId, sessionId],
    );
    return rowCount === 1;
  }

  async markPaid(purchaseId: string, paidAt: Date): Promise<void> {
    await this.unitOfWork
      .requireTransaction()
      .query(`UPDATE purchases SET status = 'paid', paid_at = $2 WHERE id = $1 AND status = 'pending'`, [purchaseId, paidAt]);
  }
}

function toPurchase(row: PurchaseRow): Purchase {
  return {
    id: row.id,
    auctionId: row.auction_id,
    buyerUserId: row.buyer_user_id,
    amountCents: row.amount_cents,
    currency: row.currency,
    status: row.status,
    providerSessionId: row.provider_session_id,
    createdAt: row.created_at,
    paidAt: row.paid_at,
  };
}
