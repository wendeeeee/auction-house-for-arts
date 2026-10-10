import { Injectable } from '@nestjs/common';
import { UnitOfWork } from '../../database';
import { BidHistoryEntry, BidHistoryKind } from './auctions.types';
import { PlannedHistoryEntry } from './bidding/bid-history-entries';

interface BidHistoryRow {
  id: number;
  auction_id: string;
  bidder_user_id: string;
  amount_cents: number;
  kind: BidHistoryKind;
  created_at: Date;
}

const BID_HISTORY_COLUMNS = 'id, auction_id, bidder_user_id, amount_cents, kind, created_at';

/** Owns the `bid_history` table: the public record, append-only. */
@Injectable()
export class BidHistoryRepository {
  constructor(private readonly unitOfWork: UnitOfWork) {}

  /**
   * Appends in the given order. One INSERT per row (there are at most two), so the BIGSERIAL ids
   * follow the array order for certain. Only valid under the auction row lock.
   */
  async append(auctionId: string, entries: readonly PlannedHistoryEntry[], createdAt: Date): Promise<void> {
    const client = this.unitOfWork.requireTransaction();
    for (const entry of entries) {
      await client.query(
        `INSERT INTO bid_history (auction_id, bidder_user_id, amount_cents, kind, created_at)
         VALUES ($1, $2, $3, $4, $5)`,
        [auctionId, entry.bidderUserId, entry.amountCents, entry.kind, createdAt],
      );
    }
  }

  /** Newest first. */
  async listForAuction(auctionId: string, limit: number): Promise<BidHistoryEntry[]> {
    const { rows } = await this.unitOfWork
      .client()
      .query<BidHistoryRow>(
        `SELECT ${BID_HISTORY_COLUMNS} FROM bid_history WHERE auction_id = $1 ORDER BY id DESC LIMIT $2`,
        [auctionId, limit],
      );
    return rows.map(toBidHistoryEntry);
  }
}

function toBidHistoryEntry(row: BidHistoryRow): BidHistoryEntry {
  return {
    id: row.id,
    auctionId: row.auction_id,
    bidderUserId: row.bidder_user_id,
    amountCents: row.amount_cents,
    kind: row.kind,
    createdAt: row.created_at,
  };
}
