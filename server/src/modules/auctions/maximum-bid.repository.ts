import { Injectable } from '@nestjs/common';
import { InvariantViolationError } from '../../common/errors';
import { UnitOfWork } from '../../database';
import { MaximumBid } from './auctions.types';

interface MaximumBidRow {
  bidder_user_id: string;
  max_cents: number;
  placement_sequence: number;
}

const MAXIMUM_BID_COLUMNS = 'bidder_user_id, max_cents, placement_sequence';

/** Owns the `max_bids` table. Private data: callers must never send another bidder's maximum to a client. */
@Injectable()
export class MaximumBidRepository {
  constructor(private readonly unitOfWork: UnitOfWork) {}

  /** No lock of its own: callers hold the auction row lock, which serializes every writer of these rows. */
  async listForAuction(auctionId: string): Promise<MaximumBid[]> {
    const { rows } = await this.unitOfWork
      .client()
      .query<MaximumBidRow>(`SELECT ${MAXIMUM_BID_COLUMNS} FROM max_bids WHERE auction_id = $1`, [auctionId]);
    return rows.map(toMaximumBid);
  }

  async findForBidder(auctionId: string, bidderUserId: string): Promise<MaximumBid | null> {
    const { rows } = await this.unitOfWork
      .client()
      .query<MaximumBidRow>(`SELECT ${MAXIMUM_BID_COLUMNS} FROM max_bids WHERE auction_id = $1 AND bidder_user_id = $2`, [
        auctionId,
        bidderUserId,
      ]);
    return rows[0] ? toMaximumBid(rows[0]) : null;
  }

  /** Only this bidder's own maximums, so callers can show them back to that bidder and no one else. */
  async listForBidderOnAuctions(bidderUserId: string, auctionIds: readonly string[]): Promise<Map<string, number>> {
    if (auctionIds.length === 0) return new Map();
    const { rows } = await this.unitOfWork
      .client()
      .query<{ auction_id: string; max_cents: number }>(
        'SELECT auction_id, max_cents FROM max_bids WHERE bidder_user_id = $1 AND auction_id = ANY($2::uuid[])',
        [bidderUserId, auctionIds],
      );
    return new Map(rows.map((row) => [row.auction_id, row.max_cents]));
  }

  /**
   * Places a first maximum, or replaces the bidder's previous one. A replacement takes a new
   * placement number, because the raised amount was committed to now, and keeps `placed_at`
   * (when the bidder first bid). Only valid while holding the auction row lock.
   */
  async placeOrReplace(bid: {
    readonly auctionId: string;
    readonly bidderUserId: string;
    readonly maxCents: number;
    readonly placedAt: Date;
  }): Promise<MaximumBid> {
    const { rows } = await this.unitOfWork.requireTransaction().query<MaximumBidRow>(
      `INSERT INTO max_bids (auction_id, bidder_user_id, max_cents, placed_at, updated_at)
       VALUES ($1, $2, $3, $4, $4)
       ON CONFLICT (auction_id, bidder_user_id) DO UPDATE
         SET max_cents = EXCLUDED.max_cents,
             updated_at = EXCLUDED.updated_at,
             placement_sequence = nextval('max_bid_placement_sequence')
       RETURNING ${MAXIMUM_BID_COLUMNS}`,
      [bid.auctionId, bid.bidderUserId, bid.maxCents, bid.placedAt],
    );
    const [row] = rows;
    if (!row) throw new InvariantViolationError('Upserting a maximum bid returned no row.');
    return toMaximumBid(row);
  }
}

function toMaximumBid(row: MaximumBidRow): MaximumBid {
  return { bidderUserId: row.bidder_user_id, maxCents: row.max_cents, placementSequence: row.placement_sequence };
}
