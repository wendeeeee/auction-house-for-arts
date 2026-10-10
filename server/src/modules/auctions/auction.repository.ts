import { Injectable } from '@nestjs/common';
import { InvariantViolationError } from '../../common/errors';
import { UnitOfWork } from '../../database';
import { Auction, AuctionListSort, AuctionStatusFilter } from './auctions.types';

interface AuctionRow {
  id: string;
  slug: string;
  artwork_id: string;
  seller_user_id: string;
  starting_price_cents: number;
  reserve_price_cents: number | null;
  ends_at: Date;
  original_ends_at: Date;
  extension_count: number;
  current_price_cents: number;
  leader_user_id: string | null;
  bid_count: number;
  closed_at: Date | null;
  created_at: Date;
}

const AUCTION_COLUMNS = `id, slug, artwork_id, seller_user_id, starting_price_cents, reserve_price_cents, ends_at,
  original_ends_at, extension_count, current_price_cents, leader_user_id, bid_count, closed_at, created_at`;

/** The constraint behind ArtworkAlreadyAtAuctionError. */
export const ONE_UNCLOSED_AUCTION_PER_ARTWORK_INDEX = 'auctions_one_unclosed_per_artwork';

export interface NewAuction {
  readonly slug: string;
  readonly artworkId: string;
  readonly sellerUserId: string;
  readonly startingPriceCents: number;
  readonly reservePriceCents: number | null;
  readonly endsAt: Date;
  readonly createdAt: Date;
}

/** Everything a bid may change on the auction row, written together under the lock. */
export interface AuctionBiddingState {
  readonly currentPriceCents: number;
  readonly leaderUserId: string | null;
  readonly bidCount: number;
  readonly endsAt: Date;
  readonly extensionCount: number;
}

export interface AuctionListFilter {
  readonly status: AuctionStatusFilter;
  /** From the injected clock: what "open" and "ended" mean right now. */
  readonly now: Date;
  /** When set, only auctions of these artworks (the artworks module resolved a medium filter). */
  readonly artworkIds?: readonly string[];
  readonly sort: AuctionListSort;
  readonly limit: number;
}

/** Fixed SQL fragments only; the sort value is checked against this map, never interpolated. */
const ORDER_BY_SORT: Readonly<Record<AuctionListSort, string>> = {
  ending_soon: 'ends_at ASC, id',
  price_low: 'current_price_cents ASC, ends_at ASC, id',
  price_high: 'current_price_cents DESC, ends_at ASC, id',
  most_bids: 'bid_count DESC, ends_at ASC, id',
};

/** Owns the `auctions` table. */
@Injectable()
export class AuctionRepository {
  constructor(private readonly unitOfWork: UnitOfWork) {}

  /** A new auction starts at its starting price with no leader. Throws the unique violation as is; the service maps it. */
  async insert(auction: NewAuction): Promise<Auction> {
    const { rows } = await this.unitOfWork.client().query<AuctionRow>(
      `INSERT INTO auctions (slug, artwork_id, seller_user_id, starting_price_cents, reserve_price_cents,
                             ends_at, original_ends_at, current_price_cents, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $6, $4, $7)
       RETURNING ${AUCTION_COLUMNS}`,
      [
        auction.slug,
        auction.artworkId,
        auction.sellerUserId,
        auction.startingPriceCents,
        auction.reservePriceCents,
        auction.endsAt,
        auction.createdAt,
      ],
    );
    return toAuction(firstRow(rows));
  }

  async findBySlug(slug: string): Promise<Auction | null> {
    const { rows } = await this.unitOfWork
      .client()
      .query<AuctionRow>(`SELECT ${AUCTION_COLUMNS} FROM auctions WHERE slug = $1`, [slug]);
    return rows[0] ? toAuction(rows[0]) : null;
  }

  /**
   * Locks the auction row until the transaction ends. Every bid on the auction, and the close
   * worker (phase 4), takes this lock first, so they run one at a time and each sees the
   * previous one's committed result. A concurrent caller waits here; with READ COMMITTED, the
   * row it then gets is the latest committed version, not the one from before it waited.
   */
  async lockAuctionForBidding(slug: string): Promise<Auction | null> {
    const { rows } = await this.unitOfWork
      .requireTransaction()
      .query<AuctionRow>(`SELECT ${AUCTION_COLUMNS} FROM auctions WHERE slug = $1 FOR UPDATE`, [slug]);
    return rows[0] ? toAuction(rows[0]) : null;
  }

  /** Only valid while holding the lock from lockAuctionForBidding. */
  async updateBiddingState(auctionId: string, state: AuctionBiddingState): Promise<void> {
    await this.unitOfWork.requireTransaction().query(
      `UPDATE auctions
          SET current_price_cents = $2, leader_user_id = $3, bid_count = $4, ends_at = $5, extension_count = $6
        WHERE id = $1`,
      [auctionId, state.currentPriceCents, state.leaderUserId, state.bidCount, state.endsAt, state.extensionCount],
    );
  }

  /** No lock, so possibly stale: the closer re-checks `ends_at` after locking. */
  async findDueForClosingIds(now: Date, limit: number): Promise<string[]> {
    const { rows } = await this.unitOfWork.client().query<{ id: string }>(
      `SELECT id FROM auctions
        WHERE closed_at IS NULL AND ends_at <= $1
        ORDER BY ends_at, id
        LIMIT $2`,
      [now, limit],
    );
    return rows.map((row) => row.id);
  }

  /**
   * The bidding lock (see bidding.service.ts). SKIP LOCKED: a row held by a bid or another
   * worker is left for the next poll instead of queueing on it.
   */
  async lockUnclosedForClosing(auctionId: string): Promise<Auction | null> {
    const { rows } = await this.unitOfWork
      .requireTransaction()
      .query<AuctionRow>(
        `SELECT ${AUCTION_COLUMNS} FROM auctions WHERE id = $1 AND closed_at IS NULL FOR UPDATE SKIP LOCKED`,
        [auctionId],
      );
    return rows[0] ? toAuction(rows[0]) : null;
  }

  async markClosed(auctionId: string, closedAt: Date): Promise<void> {
    const { rowCount } = await this.unitOfWork
      .requireTransaction()
      .query('UPDATE auctions SET closed_at = $2 WHERE id = $1 AND closed_at IS NULL', [auctionId, closedAt]);
    if (rowCount !== 1) {
      throw new InvariantViolationError('Marking an auction closed changed no row; was the lock held?', { auctionId });
    }
  }

  async list(filter: AuctionListFilter): Promise<Auction[]> {
    const conditions: string[] = [];
    const parameters: unknown[] = [];
    const bind = (value: unknown): string => {
      parameters.push(value);
      return `$${parameters.length}`;
    };

    if (filter.status === 'open') {
      conditions.push(`closed_at IS NULL AND ends_at > ${bind(filter.now)}`);
    } else if (filter.status === 'ended') {
      conditions.push(`(closed_at IS NOT NULL OR ends_at <= ${bind(filter.now)})`);
    }
    if (filter.artworkIds !== undefined) {
      conditions.push(`artwork_id = ANY(${bind(filter.artworkIds)}::uuid[])`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const { rows } = await this.unitOfWork
      .client()
      .query<AuctionRow>(
        `SELECT ${AUCTION_COLUMNS} FROM auctions ${where} ORDER BY ${ORDER_BY_SORT[filter.sort]} LIMIT ${bind(filter.limit)}`,
        parameters,
      );
    return rows.map(toAuction);
  }
}

function firstRow<T>(rows: readonly T[]): T {
  const [row] = rows;
  if (row === undefined) throw new InvariantViolationError('INSERT … RETURNING returned no row.');
  return row;
}

function toAuction(row: AuctionRow): Auction {
  return {
    id: row.id,
    slug: row.slug,
    artworkId: row.artwork_id,
    sellerUserId: row.seller_user_id,
    startingPriceCents: row.starting_price_cents,
    reservePriceCents: row.reserve_price_cents,
    endsAt: row.ends_at,
    originalEndsAt: row.original_ends_at,
    extensionCount: row.extension_count,
    currentPriceCents: row.current_price_cents,
    leaderUserId: row.leader_user_id,
    bidCount: row.bid_count,
    closedAt: row.closed_at,
    createdAt: row.created_at,
  };
}
