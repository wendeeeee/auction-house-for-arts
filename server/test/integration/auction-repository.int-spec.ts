import type { Pool } from 'pg';
import { ErrorCode } from '../../src/common/errors';
import { UnitOfWork, isUniqueViolation } from '../../src/database';
import { AuctionRepository, NewAuction, ONE_UNCLOSED_AUCTION_PER_ARTWORK_INDEX } from '../../src/modules/auctions/auction.repository';
import { BidHistoryRepository } from '../../src/modules/auctions/bid-history.repository';
import { MaximumBidRepository } from '../../src/modules/auctions/maximum-bid.repository';
import { insertArtist, insertArtwork, insertUser } from '../support/catalog-fixtures';
import { createTestPool, prepareTestDatabase, truncateAllTables } from '../support/test-database';

const NOW = new Date('2026-03-01T12:00:00.000Z');
const hoursFromNow = (hours: number): Date => new Date(NOW.getTime() + hours * 3_600_000);

describe('auction repositories', () => {
  let pool: Pool;
  let unitOfWork: UnitOfWork;
  let auctions: AuctionRepository;
  let maximumBids: MaximumBidRepository;
  let bidHistory: BidHistoryRepository;
  let sellerUserId: string;
  let artistId: string;

  beforeAll(async () => {
    await prepareTestDatabase();
    pool = createTestPool();
    unitOfWork = new UnitOfWork(pool);
    auctions = new AuctionRepository(unitOfWork);
    maximumBids = new MaximumBidRepository(unitOfWork);
    bidHistory = new BidHistoryRepository(unitOfWork);
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await truncateAllTables(pool);
    ({ artistId, userId: sellerUserId } = await insertArtist(pool));
  });

  async function newAuction(overrides: Partial<NewAuction> = {}): Promise<NewAuction> {
    const artworkId = overrides.artworkId ?? (await insertArtwork(pool, { artistId, ownerUserId: sellerUserId }));
    return {
      slug: `auction-${artworkId.slice(0, 8)}-${Math.random().toString(36).slice(2, 8)}`,
      artworkId,
      sellerUserId,
      startingPriceCents: 100_00,
      reservePriceCents: null,
      endsAt: hoursFromNow(24),
      createdAt: NOW,
      ...overrides,
    };
  }

  async function rejectionOf(promise: Promise<unknown>): Promise<unknown> {
    try {
      await promise;
    } catch (error) {
      return error;
    }
    throw new Error('expected the operation to fail');
  }

  it('creates an auction at its starting price, with no leader and the original end recorded', async () => {
    const created = await auctions.insert(await newAuction({ reservePriceCents: 500_00 }));

    expect(created).toMatchObject({
      startingPriceCents: 100_00,
      reservePriceCents: 500_00,
      currentPriceCents: 100_00,
      leaderUserId: null,
      bidCount: 0,
      extensionCount: 0,
      endsAt: hoursFromNow(24),
      originalEndsAt: hoursFromNow(24),
      closedAt: null,
    });
    expect(await auctions.findBySlug(created.slug)).toEqual(created);
  });

  it('allows one unclosed auction per artwork, and another once it is closed', async () => {
    const first = await auctions.insert(await newAuction());

    const error = await rejectionOf(auctions.insert(await newAuction({ artworkId: first.artworkId })));
    expect(isUniqueViolation(error, ONE_UNCLOSED_AUCTION_PER_ARTWORK_INDEX)).toBe(true);

    await pool.query('UPDATE auctions SET closed_at = $2 WHERE id = $1', [first.id, NOW]);
    await expect(auctions.insert(await newAuction({ artworkId: first.artworkId }))).resolves.toBeDefined();
  });

  it('rejects a reserve below the starting price at the database too', async () => {
    const error = await rejectionOf(auctions.insert(await newAuction({ startingPriceCents: 100_00, reservePriceCents: 99_99 })));
    expect(error).toMatchObject({ code: '23514', constraint: 'auctions_reserve_at_least_starting' });
  });

  it('refuses to lock an auction outside a transaction', async () => {
    const created = await auctions.insert(await newAuction());
    await expect(auctions.lockAuctionForBidding(created.slug)).rejects.toMatchObject({
      code: ErrorCode.INVARIANT_VIOLATION,
    });
  });

  it('holds the auction row lock until the transaction ends', async () => {
    const created = await auctions.insert(await newAuction());
    const otherConnection = await pool.connect();
    const tryLockFromAnotherConnection = () =>
      otherConnection.query('SELECT id FROM auctions WHERE id = $1 FOR UPDATE NOWAIT', [created.id]);

    try {
      await unitOfWork.run(async () => {
        const locked = await auctions.lockAuctionForBidding(created.slug);
        expect(locked?.id).toBe(created.id);
        // 55P03 lock_not_available: a second bidder would wait here instead of reading stale state.
        await expect(tryLockFromAnotherConnection()).rejects.toMatchObject({ code: '55P03' });
      });
      await expect(tryLockFromAnotherConnection()).resolves.toMatchObject({ rowCount: 1 });
    } finally {
      otherConnection.release();
    }
  });

  it('writes the bidding state and reads it back', async () => {
    const created = await auctions.insert(await newAuction());
    const leaderUserId = await insertUser(pool);

    await unitOfWork.run(async () => {
      await auctions.lockAuctionForBidding(created.slug);
      await auctions.updateBiddingState(created.id, {
        currentPriceCents: 310_00,
        leaderUserId,
        bidCount: 2,
        endsAt: hoursFromNow(25),
        extensionCount: 1,
      });
    });

    expect(await auctions.findBySlug(created.slug)).toMatchObject({
      currentPriceCents: 310_00,
      leaderUserId,
      bidCount: 2,
      endsAt: hoursFromNow(25),
      originalEndsAt: hoursFromNow(24),
      extensionCount: 1,
    });
  });

  it('gives a raised maximum a new, later placement number and keeps when the bidder first bid', async () => {
    const created = await auctions.insert(await newAuction());
    const [ada, bianca] = [await insertUser(pool), await insertUser(pool)];

    const { adaFirst, biancaFirst, adaRaised } = await unitOfWork.run(async () => ({
      adaFirst: await maximumBids.placeOrReplace({ auctionId: created.id, bidderUserId: ada, maxCents: 300_00, placedAt: NOW }),
      biancaFirst: await maximumBids.placeOrReplace({
        auctionId: created.id,
        bidderUserId: bianca,
        maxCents: 500_00,
        placedAt: hoursFromNow(1),
      }),
      adaRaised: await maximumBids.placeOrReplace({
        auctionId: created.id,
        bidderUserId: ada,
        maxCents: 500_00,
        placedAt: hoursFromNow(2),
      }),
    }));

    expect(biancaFirst.placementSequence).toBeGreaterThan(adaFirst.placementSequence);
    expect(adaRaised.placementSequence).toBeGreaterThan(biancaFirst.placementSequence);
    expect(await maximumBids.findForBidder(created.id, ada)).toEqual(adaRaised);
    expect(await maximumBids.listForAuction(created.id)).toHaveLength(2);

    const { rows } = await pool.query('SELECT placed_at, updated_at FROM max_bids WHERE bidder_user_id = $1', [ada]);
    expect(rows[0]).toEqual({ placed_at: NOW, updated_at: hoursFromNow(2) });
  });

  it('appends history in the given order and lists it newest first', async () => {
    const created = await auctions.insert(await newAuction());
    const [ada, chidi] = [await insertUser(pool), await insertUser(pool)];

    await unitOfWork.run(async () => {
      await bidHistory.append(created.id, [{ bidderUserId: ada, amountCents: 100_00, kind: 'placed' }], NOW);
      await bidHistory.append(
        created.id,
        [
          { bidderUserId: chidi, amountCents: 400_00, kind: 'placed' },
          { bidderUserId: ada, amountCents: 410_00, kind: 'automatic' },
        ],
        hoursFromNow(1),
      );
    });

    const history = await bidHistory.listForAuction(created.id, 10);
    expect(history.map(({ bidderUserId, amountCents, kind }) => ({ bidderUserId, amountCents, kind }))).toEqual([
      { bidderUserId: ada, amountCents: 410_00, kind: 'automatic' },
      { bidderUserId: chidi, amountCents: 400_00, kind: 'placed' },
      { bidderUserId: ada, amountCents: 100_00, kind: 'placed' },
    ]);
  });

  it('lists open and ended auctions by the given clock', async () => {
    const endingSoon = await auctions.insert(await newAuction({ endsAt: hoursFromNow(1) }));
    const endingLater = await auctions.insert(await newAuction({ endsAt: hoursFromNow(48) }));
    const ended = await auctions.insert(await newAuction({ endsAt: hoursFromNow(-1) }));

    const slugsFor = async (status: 'open' | 'ended' | 'all') =>
      (await auctions.list({ status, now: NOW, sort: 'ending_soon', limit: 10 })).map((auction) => auction.slug);

    expect(await slugsFor('open')).toEqual([endingSoon.slug, endingLater.slug]);
    expect(await slugsFor('ended')).toEqual([ended.slug]);
    expect(await slugsFor('all')).toEqual([ended.slug, endingSoon.slug, endingLater.slug]);
    expect(
      (await auctions.list({ status: 'all', now: NOW, sort: 'ending_soon', limit: 10, artworkIds: [endingLater.artworkId] })).map(
        (auction) => auction.slug,
      ),
    ).toEqual([endingLater.slug]);
  });
});
