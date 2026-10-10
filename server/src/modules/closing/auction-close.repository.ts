import { Injectable } from '@nestjs/common';
import { UnitOfWork } from '../../database';
import { AuctionClose, AuctionOutcome } from './closing.types';

interface AuctionCloseRow {
  auction_id: string;
  outcome: AuctionOutcome;
  winning_user_id: string | null;
  hammer_price_cents: number | null;
  closed_at: Date;
}

const AUCTION_CLOSE_COLUMNS = 'auction_id, outcome, winning_user_id, hammer_price_cents, closed_at';

/** Owns the `auction_closes` table. */
@Injectable()
export class AuctionCloseRepository {
  constructor(private readonly unitOfWork: UnitOfWork) {}

  async insert(close: AuctionClose): Promise<void> {
    await this.unitOfWork.requireTransaction().query(
      `INSERT INTO auction_closes (${AUCTION_CLOSE_COLUMNS}) VALUES ($1, $2, $3, $4, $5)`,
      [close.auctionId, close.outcome, close.winningUserId, close.hammerPriceCents, close.closedAt],
    );
  }

  async findByAuctionId(auctionId: string): Promise<AuctionClose | null> {
    const { rows } = await this.unitOfWork
      .client()
      .query<AuctionCloseRow>(`SELECT ${AUCTION_CLOSE_COLUMNS} FROM auction_closes WHERE auction_id = $1`, [auctionId]);
    return rows[0] ? toAuctionClose(rows[0]) : null;
  }
}

function toAuctionClose(row: AuctionCloseRow): AuctionClose {
  return {
    auctionId: row.auction_id,
    outcome: row.outcome,
    winningUserId: row.winning_user_id,
    hammerPriceCents: row.hammer_price_cents,
    closedAt: row.closed_at,
  };
}
