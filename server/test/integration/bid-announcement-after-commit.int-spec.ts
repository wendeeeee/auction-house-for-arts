import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { Pool } from 'pg';
import { InvariantViolationError } from '../../src/common/errors';
import { AuthenticatedUser } from '../../src/common/identity';
import { UnitOfWork } from '../../src/database';
import { AuctionService, BiddingService } from '../../src/modules/auctions';
import { AUCTION_EVENT_PUBLISHER } from '../../src/modules/realtime';
import { CapturingAuctionEventPublisher } from '../support/capturing-auction-event-publisher';
import { insertArtist, insertArtwork, insertUser } from '../support/catalog-fixtures';
import { createTestApp } from '../support/create-test-app';
import { createTestPool, prepareTestDatabase, truncateAllTables } from '../support/test-database';

/**
 * Makes every transaction that updated an auction fail AT COMMIT, after all of its statements
 * have succeeded. A deferred constraint trigger runs when COMMIT is issued, so the bid's code
 * path runs to the very end and only then rolls back: exactly the case where an announcement
 * made inside the unit of work would describe a bid that never happened.
 */
const CREATE_COMMIT_FAILURE_TRIGGER = `
  CREATE OR REPLACE FUNCTION test_fail_at_commit() RETURNS trigger AS $$
  BEGIN
    RAISE EXCEPTION 'test: the commit fails';
  END
  $$ LANGUAGE plpgsql;
  DROP TRIGGER IF EXISTS test_fail_at_commit ON auctions;
  CREATE CONSTRAINT TRIGGER test_fail_at_commit AFTER UPDATE ON auctions
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION test_fail_at_commit();
`;
const DROP_COMMIT_FAILURE_TRIGGER = `
  DROP TRIGGER IF EXISTS test_fail_at_commit ON auctions;
  DROP FUNCTION IF EXISTS test_fail_at_commit();
`;

describe('bid announcements happen only after commit', () => {
  let app: NestFastifyApplication;
  let pool: Pool;
  let biddingService: BiddingService;
  let auctionService: AuctionService;
  let unitOfWork: UnitOfWork;
  const publisher = new CapturingAuctionEventPublisher();

  beforeAll(async () => {
    await prepareTestDatabase();
    pool = createTestPool();
    app = await createTestApp({
      configure: (builder) => builder.overrideProvider(AUCTION_EVENT_PUBLISHER).useValue(publisher),
    });
    biddingService = app.get(BiddingService);
    auctionService = app.get(AuctionService);
    unitOfWork = app.get(UnitOfWork);
  });

  afterAll(async () => {
    await pool.query(DROP_COMMIT_FAILURE_TRIGGER);
    await app.close();
    await pool.end();
  });

  beforeEach(async () => {
    await pool.query(DROP_COMMIT_FAILURE_TRIGGER);
    await truncateAllTables(pool);
    publisher.clear();
  });

  async function openAuction(): Promise<{ slug: string; bidder: AuthenticatedUser }> {
    const { artistId, userId: sellerUserId } = await insertArtist(pool);
    const artworkId = await insertArtwork(pool, { artistId, ownerUserId: sellerUserId });
    const { rows } = await pool.query<{ slug: string }>('SELECT slug FROM artworks WHERE id = $1', [artworkId]);
    const seller: AuthenticatedUser = { id: sellerUserId, displayName: 'Seller', handle: 'seller' };
    const details = await auctionService.createAuction(seller, {
      artworkSlug: rows[0]!.slug,
      startingPriceCents: 100_00,
      endsAt: new Date(Date.now() + 24 * 3_600_000),
    });
    const bidder: AuthenticatedUser = { id: await insertUser(pool), displayName: 'Bidder', handle: 'bidder' };
    return { slug: details.auction.slug, bidder };
  }

  it('announces a committed bid once', async () => {
    const { slug, bidder } = await openAuction();

    await biddingService.placeMaximumBid(bidder, slug, 500_00);

    expect(publisher.announcements).toHaveLength(1);
  });

  it('never announces a bid whose commit fails', async () => {
    const { slug, bidder } = await openAuction();
    await pool.query(CREATE_COMMIT_FAILURE_TRIGGER);

    await expect(biddingService.placeMaximumBid(bidder, slug, 500_00)).rejects.toThrow('test: the commit fails');

    const { rows } = await pool.query<{ bid_count: number }>('SELECT bid_count FROM auctions WHERE slug = $1', [slug]);
    expect(rows[0]?.bid_count).toBe(0);
    expect(publisher.announcements).toEqual([]);
  });

  it('refuses to run inside a caller’s transaction, where it could not know when the commit happens', async () => {
    const { slug, bidder } = await openAuction();

    await expect(
      unitOfWork.run(() => biddingService.placeMaximumBid(bidder, slug, 500_00)),
    ).rejects.toBeInstanceOf(InvariantViolationError);

    expect(publisher.announcements).toEqual([]);
  });
});
