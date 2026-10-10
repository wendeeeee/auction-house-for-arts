import type { TestingModule } from '@nestjs/testing';
import type { Pool, PoolClient } from 'pg';
import { Clock } from '../../src/common/clock';
import { DomainError, ErrorCode, InvariantViolationError } from '../../src/common/errors';
import { AuthenticatedUser } from '../../src/common/identity';
import { UnitOfWork } from '../../src/database';
import { AuctionClosingService, AuctionService, BiddingService } from '../../src/modules/auctions';
import { AuctionCloseService, ClosingModule } from '../../src/modules/closing';
import { OutboxService } from '../../src/modules/outbox';
import { AUCTION_EVENT_PUBLISHER, REALTIME_EMITTER } from '../../src/modules/realtime';
import { CapturingAuctionEventPublisher } from '../support/capturing-auction-event-publisher';
import { CapturingRealtimeEmitter } from '../support/capturing-realtime-emitter';
import { insertArtist, insertArtwork, insertUser } from '../support/catalog-fixtures';
import { createTestContext } from '../support/create-test-context';
import { FakeClock } from '../support/fake-clock';
import { createTestPool, prepareTestDatabase, truncateAllTables } from '../support/test-database';
import { waitFor } from '../support/wait-for';

const START = new Date('2026-01-15T12:00:00.000Z');
const ENDS_AT = new Date(START.getTime() + 60 * 60 * 1_000);
const SOFT_CLOSE_WINDOW_SECONDS = 120;
const at = (base: Date, offsetSeconds: number): Date => new Date(base.getTime() + offsetSeconds * 1_000);

/** Holds a bid mid-transaction (lock taken, clock read) until the test releases the advisory lock. */
const ADVISORY_LOCK_KEY = 4_104_004;
const CREATE_BID_GATE_TRIGGER = `
  CREATE OR REPLACE FUNCTION test_gate_auction_update() RETURNS trigger AS $$
  BEGIN
    PERFORM pg_advisory_xact_lock(${ADVISORY_LOCK_KEY});
    RETURN NEW;
  END
  $$ LANGUAGE plpgsql;
  DROP TRIGGER IF EXISTS test_gate_auction_update ON auctions;
  CREATE TRIGGER test_gate_auction_update BEFORE UPDATE ON auctions
    FOR EACH ROW EXECUTE FUNCTION test_gate_auction_update();
`;
const DROP_BID_GATE_TRIGGER = `
  DROP TRIGGER IF EXISTS test_gate_auction_update ON auctions;
  DROP FUNCTION IF EXISTS test_gate_auction_update();
`;

const CREATE_CLOSE_WIDENING_TRIGGER = `
  CREATE OR REPLACE FUNCTION test_widen_close_race() RETURNS trigger AS $$
  BEGIN
    PERFORM pg_sleep(0.05);
    RETURN NEW;
  END
  $$ LANGUAGE plpgsql;
  DROP TRIGGER IF EXISTS test_widen_close_race ON auction_closes;
  CREATE TRIGGER test_widen_close_race BEFORE INSERT ON auction_closes
    FOR EACH ROW EXECUTE FUNCTION test_widen_close_race();
`;
const DROP_CLOSE_WIDENING_TRIGGER = `
  DROP TRIGGER IF EXISTS test_widen_close_race ON auction_closes;
  DROP FUNCTION IF EXISTS test_widen_close_race();
`;

interface StoredClose {
  auction_id: string;
  outcome: string;
  winning_user_id: string | null;
  hammer_price_cents: number | null;
  closed_at: Date;
}

describe('closing auctions', () => {
  const clock = new FakeClock(START);
  const emitter = new CapturingRealtimeEmitter();
  let pool: Pool;
  /** Two workers with separate pools. */
  let workerA: TestingModule;
  let workerB: TestingModule;
  let auctionService: AuctionService;
  let biddingService: BiddingService;
  let closeService: AuctionCloseService;
  let secondCloseService: AuctionCloseService;

  async function startWorker(): Promise<TestingModule> {
    return createTestContext({
      imports: [ClosingModule],
      configure: (builder) =>
        builder
          .overrideProvider(Clock)
          .useValue(clock)
          .overrideProvider(AUCTION_EVENT_PUBLISHER)
          .useValue(new CapturingAuctionEventPublisher())
          .overrideProvider(REALTIME_EMITTER)
          .useValue(emitter),
    });
  }

  beforeAll(async () => {
    await prepareTestDatabase();
    pool = createTestPool();
    workerA = await startWorker();
    workerB = await startWorker();
    auctionService = workerA.get(AuctionService, { strict: false });
    biddingService = workerA.get(BiddingService, { strict: false });
    closeService = workerA.get(AuctionCloseService, { strict: false });
    secondCloseService = workerB.get(AuctionCloseService, { strict: false });
  });

  afterAll(async () => {
    await pool.query(DROP_BID_GATE_TRIGGER);
    await pool.query(DROP_CLOSE_WIDENING_TRIGGER);
    await workerA.close();
    await workerB.close();
    await pool.end();
  });

  beforeEach(async () => {
    await pool.query(DROP_BID_GATE_TRIGGER);
    await pool.query(DROP_CLOSE_WIDENING_TRIGGER);
    await truncateAllTables(pool);
    clock.setTo(START);
    emitter.clear();
  });

  async function createUser(handle: string): Promise<AuthenticatedUser> {
    return { id: await insertUser(pool), displayName: handle, handle };
  }

  async function openAuction(options: { reservePriceCents?: number; endsAt?: Date } = {}) {
    const { artistId, userId: sellerUserId } = await insertArtist(pool);
    const artworkId = await insertArtwork(pool, { artistId, ownerUserId: sellerUserId, title: 'Harbour at Noon' });
    const { rows } = await pool.query<{ slug: string }>('SELECT slug FROM artworks WHERE id = $1', [artworkId]);
    const artworkSlug = rows[0]!.slug;
    const seller: AuthenticatedUser = { id: sellerUserId, displayName: 'Seller', handle: 'seller' };
    clock.setTo(START);
    const details = await auctionService.createAuction(seller, {
      artworkSlug,
      startingPriceCents: 100_00,
      reservePriceCents: options.reservePriceCents,
      endsAt: options.endsAt ?? ENDS_AT,
    });
    return { id: details.auction.id, slug: details.auction.slug, artworkSlug, seller };
  }

  async function loadCloses(): Promise<StoredClose[]> {
    return (await pool.query<StoredClose>('SELECT * FROM auction_closes ORDER BY auction_id')).rows;
  }

  async function loadOutboxEvents() {
    return (
      await pool.query<{ id: string; type: string; payload: Record<string, unknown>; published_at: Date | null }>(
        'SELECT id, type, payload, published_at FROM outbox_events ORDER BY occurred_at, id',
      )
    ).rows;
  }

  async function loadClosedAt(auctionId: string): Promise<Date | null> {
    return (await pool.query<{ closed_at: Date | null }>('SELECT closed_at FROM auctions WHERE id = $1', [auctionId])).rows[0]!
      .closed_at;
  }

  describe('the close-versus-extension race', () => {
    let gateHolder: PoolClient | null = null;

    afterEach(async () => {
      if (gateHolder) {
        await gateHolder.query('SELECT pg_advisory_unlock_all()');
        gateHolder.release();
        gateHolder = null;
      }
    });

    it('does not close an auction that a late bid extended after the worker selected it, and closes it once it truly ends', async () => {
      const auction = await openAuction();
      const lateBidder = await createUser('late_bidder');
      await pool.query(CREATE_BID_GATE_TRIGGER);
      gateHolder = await pool.connect();
      await gateHolder.query('SELECT pg_advisory_lock($1)', [ADVISORY_LOCK_KEY]);

      // A bid one second before the end takes the lock and is held before writing its extension.
      clock.setTo(at(ENDS_AT, -1));
      const lateBid = biddingService.placeMaximumBid(lateBidder, auction.slug, 150_00);
      await waitFor(
        async () =>
          (await pool.query(`SELECT 1 FROM pg_locks WHERE locktype = 'advisory' AND NOT granted`)).rowCount === 1,
        { description: 'the bid to wait at the gate' },
      );

      // The deadline passes; the worker's selection still sees the original end.
      clock.setTo(at(ENDS_AT, 1));
      const staleSelection = await workerA
        .get(AuctionClosingService, { strict: false })
        .findDueAuctionIds(clock.now(), 50);
      expect(staleSelection).toEqual([auction.id]);

      await gateHolder.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_KEY]);
      const bidOutcome = await lateBid;
      expect(bidOutcome).toMatchObject({ isLeading: true, isExtended: true });
      expect(bidOutcome.endsAt).toEqual(at(ENDS_AT, -1 + SOFT_CLOSE_WINDOW_SECONDS));
      await pool.query(DROP_BID_GATE_TRIGGER);

      const result = await closeService.closeAuctionIfDue(staleSelection[0]!);

      expect(result).toBe('not_due');
      expect(await loadCloses()).toEqual([]);
      expect(await loadOutboxEvents()).toEqual([]);
      expect(await loadClosedAt(auction.id)).toBeNull();
      expect(emitter.emits).toEqual([]);

      clock.setTo(at(bidOutcome.endsAt, 1));
      expect(await closeService.closeDueAuctions()).toEqual({ closed: 1, notDue: 0, skipped: 0, failed: 0 });
      expect(await loadCloses()).toEqual([
        {
          auction_id: auction.id,
          outcome: 'sold',
          winning_user_id: lateBidder.id,
          hammer_price_cents: 100_00,
          closed_at: clock.now(),
        },
      ]);
      expect(emitter.emits).toEqual([
        { room: 'auction', target: auction.slug, eventName: 'auction:closed', payload: { slug: auction.slug } },
      ]);
    });

    it('rejects a bid that arrives after the close committed, even though it waited on the same lock', async () => {
      const auction = await openAuction();
      const bidder = await createUser('too_late');
      clock.setTo(at(ENDS_AT, 1));
      await closeService.closeDueAuctions();

      // closed_at decides, even with the clock wound back.
      clock.setTo(at(ENDS_AT, -30));
      await expect(biddingService.placeMaximumBid(bidder, auction.slug, 150_00)).rejects.toMatchObject({
        code: ErrorCode.AUCTION_ENDED,
      });
    });
  });

  it('two workers closing at the same time produce exactly one close and one event per auction', async () => {
    const auctions = [];
    for (let index = 0; index < 5; index += 1) auctions.push(await openAuction());
    const bidder = await createUser('bidder');
    clock.setTo(at(START, 60));
    for (const auction of auctions) await biddingService.placeMaximumBid(bidder, auction.slug, 200_00);
    await pool.query(CREATE_CLOSE_WIDENING_TRIGGER);

    clock.setTo(at(ENDS_AT, 1));
    const summaries = await Promise.all([closeService.closeDueAuctions(), secondCloseService.closeDueAuctions()]);
    // Anything skipped because the other worker held the lock closes on the next poll.
    const laterSummaries = await Promise.all([closeService.closeDueAuctions(), secondCloseService.closeDueAuctions()]);

    const totalClosed = [...summaries, ...laterSummaries].reduce((total, summary) => total + summary.closed, 0);
    expect(totalClosed).toBe(5);
    expect([...summaries, ...laterSummaries].every((summary) => summary.failed === 0)).toBe(true);
    const closes = await loadCloses();
    expect(closes.map((close) => close.auction_id).sort()).toEqual(auctions.map((auction) => auction.id).sort());
    const events = await loadOutboxEvents();
    expect(events).toHaveLength(5);
    expect(emitter.emits).toHaveLength(5);
    expect(new Set(events.map((event) => event.payload.auctionId))).toEqual(new Set(auctions.map((auction) => auction.id)));
  });

  it('records each outcome with its AuctionClosed event, and frees the artwork for a new auction', async () => {
    const sold = await openAuction();
    const reserveNotMet = await openAuction({ reservePriceCents: 1_000_00 });
    const noBids = await openAuction({ reservePriceCents: 500_00 });
    const winner = await createUser('winner');
    const runnerUp = await createUser('runner_up');
    clock.setTo(at(START, 60));
    await biddingService.placeMaximumBid(winner, sold.slug, 900_00);
    await biddingService.placeMaximumBid(runnerUp, sold.slug, 300_00);
    await biddingService.placeMaximumBid(runnerUp, reserveNotMet.slug, 800_00);

    clock.setTo(at(ENDS_AT, 5));
    expect(await closeService.closeDueAuctions()).toEqual({ closed: 3, notDue: 0, skipped: 0, failed: 0 });

    const closesById = new Map((await loadCloses()).map((close) => [close.auction_id, close]));
    expect(closesById.get(sold.id)).toMatchObject({ outcome: 'sold', winning_user_id: winner.id, hammer_price_cents: 310_00 });
    expect(closesById.get(reserveNotMet.id)).toMatchObject({
      outcome: 'reserve_not_met',
      winning_user_id: null,
      hammer_price_cents: null,
    });
    expect(closesById.get(noBids.id)).toMatchObject({ outcome: 'no_bids', winning_user_id: null, hammer_price_cents: null });
    for (const auction of [sold, reserveNotMet, noBids]) expect(await loadClosedAt(auction.id)).toEqual(clock.now());

    const events = await loadOutboxEvents();
    expect(events.every((event) => event.type === 'AuctionClosed' && event.published_at === null)).toBe(true);
    const payloadsByAuctionId = new Map(events.map((event) => [event.payload.auctionId, event.payload]));
    expect(payloadsByAuctionId.get(sold.id)).toEqual({
      auctionId: sold.id,
      auctionSlug: sold.slug,
      artworkTitle: 'Harbour at Noon',
      sellerUserId: sold.seller.id,
      outcome: 'sold',
      winningUserId: winner.id,
      leadingBidderUserId: winner.id,
      hammerPriceCents: 310_00,
      closedAt: clock.now().toISOString(),
    });
    expect(payloadsByAuctionId.get(reserveNotMet.id)).toMatchObject({
      outcome: 'reserve_not_met',
      winningUserId: null,
      leadingBidderUserId: runnerUp.id,
    });
    expect(payloadsByAuctionId.get(noBids.id)).toMatchObject({ outcome: 'no_bids', leadingBidderUserId: null });

    await expect(
      auctionService.createAuction(noBids.seller, {
        artworkSlug: noBids.artworkSlug,
        startingPriceCents: 100_00,
        endsAt: at(clock.now(), 3_600),
      }),
    ).resolves.toBeDefined();
  });

  it('leaves auctions that have not ended alone', async () => {
    await openAuction();
    clock.setTo(at(ENDS_AT, -1));
    expect(await closeService.closeDueAuctions()).toEqual({ closed: 0, notDue: 0, skipped: 0, failed: 0 });
    expect(await loadCloses()).toEqual([]);
  });

  describe('recordEvent', () => {
    const payload = (auctionId: string) => ({
      auctionId,
      auctionSlug: 'some-lot',
      artworkTitle: 'Some Lot',
      sellerUserId: auctionId,
      outcome: 'no_bids' as const,
      winningUserId: null,
      leadingBidderUserId: null,
      hammerPriceCents: null,
      closedAt: START.toISOString(),
    });

    it('refuses to run outside a unit of work', async () => {
      const outbox = workerA.get(OutboxService, { strict: false });
      await expect(outbox.recordEvent('AuctionClosed', payload('5eed0000-0000-4000-8000-000000000001'))).rejects.toBeInstanceOf(
        InvariantViolationError,
      );
      expect(await loadOutboxEvents()).toEqual([]);
    });

    it('rolls back with the change it belongs to', async () => {
      const outbox = workerA.get(OutboxService, { strict: false });
      const unitOfWork = workerA.get(UnitOfWork, { strict: false });
      await expect(
        unitOfWork.run(async () => {
          await outbox.recordEvent('AuctionClosed', payload('5eed0000-0000-4000-8000-000000000002'));
          throw new Error('the change failed');
        }),
      ).rejects.toThrow('the change failed');
      expect(await loadOutboxEvents()).toEqual([]);
    });

    it('rejects a payload that does not match the event schema', async () => {
      const outbox = workerA.get(OutboxService, { strict: false });
      const unitOfWork = workerA.get(UnitOfWork, { strict: false });
      const invalid = { ...payload('5eed0000-0000-4000-8000-000000000003'), hammerPriceCents: -5 };
      await expect(unitOfWork.run(() => outbox.recordEvent('AuctionClosed', invalid))).rejects.toBeInstanceOf(DomainError);
    });
  });
});
