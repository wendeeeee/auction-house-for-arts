import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { Pool } from 'pg';
import { DomainError } from '../../src/common/errors';
import { AuthenticatedUser } from '../../src/common/identity';
import { AuctionService, BiddingService } from '../../src/modules/auctions';
import { resolveProxyBids } from '../../src/modules/auctions/bidding/proxy-bid-resolution';
import { insertArtist, insertArtwork, insertUser } from '../support/catalog-fixtures';
import { createTestApp } from '../support/create-test-app';
import { createTestPool, prepareTestDatabase, truncateAllTables } from '../support/test-database';

const CONCURRENT_BIDDERS = 20;

/**
 * Sleeps inside every max_bids write: after the transaction has read the maximums and decided,
 * and before it writes. That widens the window in which a second transaction could read the
 * same, soon-to-be-stale state. With the auction row lock, the second transaction cannot get
 * that far until the first commits, so the sleep only slows the test down.
 */
const CREATE_RACE_WIDENING_TRIGGER = `
  CREATE OR REPLACE FUNCTION test_widen_bidding_race() RETURNS trigger AS $$
  BEGIN
    PERFORM pg_sleep(0.05);
    RETURN NEW;
  END
  $$ LANGUAGE plpgsql;
  DROP TRIGGER IF EXISTS test_widen_bidding_race ON max_bids;
  CREATE TRIGGER test_widen_bidding_race BEFORE INSERT OR UPDATE ON max_bids
    FOR EACH ROW EXECUTE FUNCTION test_widen_bidding_race();
`;
const DROP_RACE_WIDENING_TRIGGER = `
  DROP TRIGGER IF EXISTS test_widen_bidding_race ON max_bids;
  DROP FUNCTION IF EXISTS test_widen_bidding_race();
`;

type BidResult = 'accepted' | string;

describe('bidding under concurrency', () => {
  let app: NestFastifyApplication;
  let pool: Pool;
  let biddingService: BiddingService;
  let auctionService: AuctionService;
  const originalPoolMax = process.env.DATABASE_POOL_MAX;

  beforeAll(async () => {
    await prepareTestDatabase();
    pool = createTestPool();
    // Every bid needs its own connection to be truly concurrent; the default pool of 10 would
    // queue half of them in the application instead of on the row lock.
    process.env.DATABASE_POOL_MAX = String(CONCURRENT_BIDDERS + 5);
    app = await createTestApp();
    biddingService = app.get(BiddingService);
    auctionService = app.get(AuctionService);
    await pool.query(CREATE_RACE_WIDENING_TRIGGER);
  });

  afterAll(async () => {
    await pool.query(DROP_RACE_WIDENING_TRIGGER);
    await app.close();
    await pool.end();
    if (originalPoolMax === undefined) delete process.env.DATABASE_POOL_MAX;
    else process.env.DATABASE_POOL_MAX = originalPoolMax;
  });

  beforeEach(async () => {
    await truncateAllTables(pool);
  });

  async function openAuction(): Promise<string> {
    const { artistId, userId: sellerUserId } = await insertArtist(pool);
    const artworkId = await insertArtwork(pool, { artistId, ownerUserId: sellerUserId });
    const { rows } = await pool.query<{ slug: string }>('SELECT slug FROM artworks WHERE id = $1', [artworkId]);
    const seller: AuthenticatedUser = { id: sellerUserId, displayName: 'Seller', handle: 'seller' };
    const details = await auctionService.createAuction(seller, {
      artworkSlug: rows[0]!.slug,
      startingPriceCents: 100_00,
      endsAt: new Date(Date.now() + 24 * 3_600_000),
    });
    return details.auction.slug;
  }

  async function createBidders(count: number): Promise<AuthenticatedUser[]> {
    const bidders: AuthenticatedUser[] = [];
    for (let index = 0; index < count; index += 1) {
      const id = await insertUser(pool);
      bidders.push({ id, displayName: `Bidder ${index}`, handle: `bidder_${index}` });
    }
    return bidders;
  }

  /** Starts every bid in the same tick, so they reach the database together. */
  function placeAllAtOnce(slug: string, bids: readonly { bidder: AuthenticatedUser; maxBidCents: number }[]) {
    return Promise.all(
      bids.map(({ bidder, maxBidCents }) =>
        biddingService.placeMaximumBid(bidder, slug, maxBidCents).then(
          (): BidResult => 'accepted',
          (error: unknown): BidResult => (error instanceof DomainError ? error.code : String(error)),
        ),
      ),
    );
  }

  async function loadStoredState(slug: string) {
    const auction = (
      await pool.query<{
        id: string;
        starting_price_cents: number;
        reserve_price_cents: number | null;
        current_price_cents: number;
        leader_user_id: string | null;
        bid_count: number;
      }>(
        `SELECT id, starting_price_cents, reserve_price_cents, current_price_cents, leader_user_id, bid_count
           FROM auctions WHERE slug = $1`,
        [slug],
      )
    ).rows[0]!;
    const maximumBids = (
      await pool.query<{ bidder_user_id: string; max_cents: number; placement_sequence: number }>(
        'SELECT bidder_user_id, max_cents, placement_sequence FROM max_bids WHERE auction_id = $1',
        [auction.id],
      )
    ).rows.map((row) => ({
      bidderUserId: row.bidder_user_id,
      maxCents: row.max_cents,
      placementSequence: row.placement_sequence,
    }));
    const history = (
      await pool.query<{ bidder_user_id: string; amount_cents: number }>(
        'SELECT bidder_user_id, amount_cents FROM bid_history WHERE auction_id = $1 ORDER BY id',
        [auction.id],
      )
    ).rows;
    return { auction, maximumBids, history };
  }

  it(`serializes ${CONCURRENT_BIDDERS} simultaneous bids: the stored state equals a recomputation from every maximum`, async () => {
    const slug = await openAuction();
    const bidders = await createBidders(CONCURRENT_BIDDERS);
    // Distinct amounts across several increment tiers, plus one exact tie (the last two),
    // so the order the lock admits them in decides who is rejected and who leads a tie.
    const bids = bidders.map((bidder, index) => ({
      bidder,
      maxBidCents: index === CONCURRENT_BIDDERS - 1 ? 300_00 + (index - 1) * 123_00 : 300_00 + index * 123_00,
    }));

    const results = await placeAllAtOnce(slug, bids);

    // Every bid was either accepted or turned away by the rules; nothing failed for any other reason.
    expect(results.filter((result) => result !== 'accepted' && result !== 'BID_TOO_LOW')).toEqual([]);
    const acceptedBidderIds = bids.filter((_bid, index) => results[index] === 'accepted').map((bid) => bid.bidder.id);
    expect(acceptedBidderIds.length).toBeGreaterThanOrEqual(2);

    const { auction, maximumBids, history } = await loadStoredState(slug);

    // Exactly the accepted bids left a maximum; a rejected bid left nothing behind.
    expect(maximumBids.map((bid) => bid.bidderUserId).sort()).toEqual([...acceptedBidderIds].sort());

    // The denormalized price and leader are what the pure rules compute from all the maximums.
    const expected = resolveProxyBids({
      startingPriceCents: auction.starting_price_cents,
      reservePriceCents: auction.reserve_price_cents,
      maximumBids,
    });
    expect({ priceCents: auction.current_price_cents, leaderUserId: auction.leader_user_id }).toEqual({
      priceCents: expected.priceCents,
      leaderUserId: expected.leaderUserId,
    });

    // The history is consistent: counted, never decreasing, and ending at (leader, price).
    expect(history).toHaveLength(auction.bid_count);
    const amounts = history.map((row) => row.amount_cents);
    expect(amounts).toEqual([...amounts].sort((first, second) => first - second));
    expect(history.at(-1)).toEqual({ bidder_user_id: expected.leaderUserId, amount_cents: expected.priceCents });
  });

  it('serializes simultaneous raises by one bidder against a rival', async () => {
    const slug = await openAuction();
    const [leader, rival] = await createBidders(2);
    await biddingService.placeMaximumBid(leader!, slug, 500_00);

    const results = await placeAllAtOnce(slug, [
      { bidder: rival!, maxBidCents: 700_00 },
      { bidder: leader!, maxBidCents: 650_00 },
      { bidder: leader!, maxBidCents: 900_00 },
      { bidder: rival!, maxBidCents: 1_200_00 },
    ]);

    expect(results.filter((result) => !['accepted', 'BID_TOO_LOW', 'MAX_NOT_RAISED'].includes(result))).toEqual([]);
    const { auction, maximumBids, history } = await loadStoredState(slug);
    const expected = resolveProxyBids({
      startingPriceCents: auction.starting_price_cents,
      reservePriceCents: auction.reserve_price_cents,
      maximumBids,
    });
    expect(auction.current_price_cents).toBe(expected.priceCents);
    expect(auction.leader_user_id).toBe(expected.leaderUserId);
    expect(history).toHaveLength(auction.bid_count);
    expect(history.at(-1)).toEqual({ bidder_user_id: expected.leaderUserId, amount_cents: expected.priceCents });
  });
});
