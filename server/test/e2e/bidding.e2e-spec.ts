import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { Pool } from 'pg';
import { Clock } from '../../src/common/clock';
import { seedCatalog } from '../../src/database/seed/seed-catalog';
import { auctionApi, collectKeys, seedUserId } from '../support/auction-api';
import { createTestApp } from '../support/create-test-app';
import { FakeClock } from '../support/fake-clock';
import { createTestPool, prepareTestDatabase, truncateAllTables } from '../support/test-database';

const START = new Date('2026-01-15T12:00:00.000Z');
const ENDS_AT = new Date(START.getTime() + 60 * 60 * 1_000);
const SOFT_CLOSE_WINDOW_SECONDS = 120; // the configured default
const secondsBeforeEnd = (seconds: number): Date => new Date(ENDS_AT.getTime() - seconds * 1_000);

describe('bidding API', () => {
  let app: NestFastifyApplication;
  let pool: Pool;
  let api: ReturnType<typeof auctionApi>;
  const clock = new FakeClock(START);

  beforeAll(async () => {
    await prepareTestDatabase();
    pool = createTestPool();
    app = await createTestApp({ configure: (builder) => builder.overrideProvider(Clock).useValue(clock) });
    api = auctionApi(app);
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  beforeEach(async () => {
    await truncateAllTables(pool);
    await seedCatalog(pool);
    clock.setTo(START);
  });

  /** Rafael sells his own Desert Geometry: $100 start, ending an hour after START. */
  async function openAuction(options: { reservePriceCents?: number; artworkSlug?: string; sellerHandle?: string } = {}) {
    const response = await api.create(options.sellerHandle ?? 'rafael_ortiz', {
      artworkSlug: options.artworkSlug ?? 'desert-geometry',
      startingPriceCents: 100_00,
      reservePriceCents: options.reservePriceCents,
      endsAt: ENDS_AT.toISOString(),
    });
    expect(response.statusCode).toBe(201);
    return response.json().slug as string;
  }

  async function expectRejection(response: Awaited<ReturnType<typeof api.bid>>, code: string) {
    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe(code);
    return response.json().error;
  }

  describe('accepted bids', () => {
    it('leads with a first bid at the starting price', async () => {
      const slug = await openAuction();

      const response = await api.bid('ada_mensah', slug, 500_00);

      expect(response.statusCode).toBe(201);
      expect(response.json()).toEqual({
        leading: true,
        priceCents: 100_00,
        minimumNextBidCents: 105_00,
        endsAt: ENDS_AT.toISOString(),
        extended: false,
      });
    });

    it('accepts a bid that an existing maximum beats at once, with leading: false', async () => {
      const slug = await openAuction();
      await api.bid('ada_mensah', slug, 500_00);

      const response = await api.bid('bianca_rossi', slug, 300_00);

      expect(response.statusCode).toBe(201);
      expect(response.json()).toMatchObject({ leading: false, priceCents: 310_00, minimumNextBidCents: 320_00 });

      const detail = (await api.get(slug)).json();
      expect(detail).toMatchObject({ leaderHandle: 'ada_mensah', priceCents: 310_00, bidCount: 3 });
      expect(detail.history.map(({ bidderHandle, amountCents, kind }: Record<string, unknown>) => [bidderHandle, amountCents, kind])).toEqual([
        ['ada_mensah', 310_00, 'automatic'],
        ['bianca_rossi', 300_00, 'placed'],
        ['ada_mensah', 100_00, 'placed'],
      ]);
    });

    it('takes the lead at one increment over the old maximum, not at the new maximum', async () => {
      const slug = await openAuction();
      await api.bid('ada_mensah', slug, 500_00);

      const response = await api.bid('bianca_rossi', slug, 600_00);

      expect(response.json()).toMatchObject({ leading: true, priceCents: 510_00 });
      expect((await api.get(slug)).json().leaderHandle).toBe('bianca_rossi');
    });

    it('shows each user only their own maximum', async () => {
      const slug = await openAuction();
      await api.bid('ada_mensah', slug, 512_34);
      await api.bid('bianca_rossi', slug, 300_00);

      const asLeader = (await api.get(slug, 'ada_mensah')).json();
      expect(asLeader).toMatchObject({ yourMaxBidCents: 512_34, youAreLeading: true, youMayBid: true });

      const asOutbid = await api.get(slug, 'bianca_rossi');
      expect(asOutbid.json()).toMatchObject({ yourMaxBidCents: 300_00, youAreLeading: false });
      expect(asOutbid.body).not.toContain('51234');

      const anonymous = await api.get(slug);
      expect(anonymous.json()).toMatchObject({ yourMaxBidCents: null, youAreLeading: false, youMayBid: false });
      expect(anonymous.body).not.toContain('51234');
    });

    it('lets the artist bid on a collector’s resale of their own work', async () => {
      const slug = await openAuction({ artworkSlug: 'lagos-at-dusk', sellerHandle: 'bianca_rossi' });

      const response = await api.bid('amara_okafor', slug, 200_00);

      expect(response.statusCode).toBe(201);
      expect(response.json().leading).toBe(true);
    });
  });

  describe('rejections', () => {
    it('BID_TOO_LOW: below the minimum next bid, with the minimum in details, and leaves no trace', async () => {
      const slug = await openAuction();
      await api.bid('ada_mensah', slug, 500_00);

      const error = await expectRejection(await api.bid('chidi_nwosu', slug, 104_99), 'BID_TOO_LOW');

      expect(error.details).toEqual({ maxBidCents: 104_99, minimumNextBidCents: 105_00 });
      expect((await api.get(slug, 'chidi_nwosu')).json()).toMatchObject({ bidCount: 1, yourMaxBidCents: null });
    });

    it('BID_TOO_LOW: a first bid below the starting price', async () => {
      const slug = await openAuction();
      const error = await expectRejection(await api.bid('ada_mensah', slug, 99_99), 'BID_TOO_LOW');
      expect(error.details.minimumNextBidCents).toBe(100_00);
    });

    it('MAX_NOT_RAISED: the leader resubmitting a maximum that is not higher', async () => {
      const slug = await openAuction();
      await api.bid('ada_mensah', slug, 500_00);

      const error = await expectRejection(await api.bid('ada_mensah', slug, 500_00), 'MAX_NOT_RAISED');
      expect(error.details).toEqual({ maxBidCents: 500_00, yourMaxBidCents: 500_00 });
    });

    it('NOT_ALLOWED_TO_BID: the seller', async () => {
      const slug = await openAuction();
      const error = await expectRejection(await api.bid('rafael_ortiz', slug, 500_00), 'NOT_ALLOWED_TO_BID');
      expect(error.details).toEqual({ reason: 'seller' });
      expect((await api.get(slug, 'rafael_ortiz')).json().youMayBid).toBe(false);
    });

    it('NOT_ALLOWED_TO_BID: the current owner, judged at bid time', async () => {
      const slug = await openAuction();
      // Ownership changes hands mid-auction (in later phases, through a completed sale).
      await pool.query('UPDATE artworks SET owner_user_id = $1 WHERE slug = $2', [
        seedUserId('chidi_nwosu'),
        'desert-geometry',
      ]);

      const error = await expectRejection(await api.bid('chidi_nwosu', slug, 500_00), 'NOT_ALLOWED_TO_BID');
      expect(error.details).toEqual({ reason: 'owner' });
    });

    it('AUCTION_ENDED: judged by the injected clock, from the instant ends_at arrives', async () => {
      const slug = await openAuction();

      // Bid well outside the soft-close window so it doesn't extend the auction.
      clock.setTo(secondsBeforeEnd(SOFT_CLOSE_WINDOW_SECONDS + 1));
      expect((await api.bid('ada_mensah', slug, 200_00)).statusCode).toBe(201);

      clock.setTo(ENDS_AT);
      const error = await expectRejection(await api.bid('bianca_rossi', slug, 900_00), 'AUCTION_ENDED');
      expect(error.details).toEqual({ endsAt: expect.any(String) });
      expect((await api.get(slug, 'bianca_rossi')).json()).toMatchObject({ status: 'ended', youMayBid: false });
    });

    it('AUCTION_NOT_FOUND, UNAUTHENTICATED, and VALIDATION_FAILED', async () => {
      const slug = await openAuction();

      const missing = await api.bid('ada_mensah', 'no-such-auction', 500_00);
      expect(missing.statusCode).toBe(404);
      expect(missing.json().error.code).toBe('AUCTION_NOT_FOUND');

      const anonymous = await api.bid(null, slug, 500_00);
      expect(anonymous.statusCode).toBe(401);

      for (const invalid of [500.5, '50000', -100, 0]) {
        const response = await api.bid('ada_mensah', slug, invalid);
        expect(response.statusCode).toBe(400);
        expect(response.json().error.details.fieldErrors[0].path).toBe('maxBidCents');
      }
    });
  });

  describe('soft close', () => {
    it('extends to bid time + window when a bid changes the price inside the window, keeping the original end', async () => {
      const slug = await openAuction();
      await api.bid('ada_mensah', slug, 500_00);

      clock.setTo(secondsBeforeEnd(60));
      const response = await api.bid('bianca_rossi', slug, 600_00);

      const extendedEnd = new Date(secondsBeforeEnd(60).getTime() + SOFT_CLOSE_WINDOW_SECONDS * 1_000).toISOString();
      expect(response.json()).toMatchObject({ leading: true, extended: true, endsAt: extendedEnd });
      expect((await api.get(slug)).json()).toMatchObject({
        endsAt: extendedEnd,
        originalEndsAt: ENDS_AT.toISOString(),
        extensionCount: 1,
        status: 'open',
      });

      // The old end has passed, but the auction is still open, and another late bid extends again.
      clock.setTo(new Date(new Date(extendedEnd).getTime() - 10_000));
      const again = await api.bid('ada_mensah', slug, 700_00);
      expect(again.json()).toMatchObject({ extended: true, leading: true });
      expect((await api.get(slug)).json().extensionCount).toBe(2);
    });

    it('extends for a bid that is outbid at once, because the price still moved', async () => {
      const slug = await openAuction();
      await api.bid('ada_mensah', slug, 500_00);

      clock.setTo(secondsBeforeEnd(30));
      const response = await api.bid('chidi_nwosu', slug, 400_00);

      expect(response.json()).toMatchObject({ leading: false, priceCents: 410_00, extended: true });
    });

    it('does not extend for a bid outside the window', async () => {
      const slug = await openAuction();
      clock.setTo(secondsBeforeEnd(SOFT_CLOSE_WINDOW_SECONDS));

      const response = await api.bid('ada_mensah', slug, 500_00);

      expect(response.json()).toMatchObject({ extended: false, endsAt: ENDS_AT.toISOString() });
    });

    it('does not extend, or add history, when the leader raises their own maximum inside the window', async () => {
      const slug = await openAuction();
      await api.bid('ada_mensah', slug, 500_00);
      await api.bid('bianca_rossi', slug, 300_00);

      clock.setTo(secondsBeforeEnd(30));
      const response = await api.bid('ada_mensah', slug, 900_00);

      expect(response.statusCode).toBe(201);
      expect(response.json()).toEqual({
        leading: true,
        priceCents: 310_00,
        minimumNextBidCents: 320_00,
        endsAt: ENDS_AT.toISOString(),
        extended: false,
      });
      expect((await api.get(slug, 'ada_mensah')).json()).toMatchObject({
        bidCount: 3,
        extensionCount: 0,
        yourMaxBidCents: 900_00,
      });
    });
  });

  describe('the hidden reserve', () => {
    // A distinctive amount, so a leak would show up as this exact number anywhere in a body.
    const RESERVE_CENTS = 777_00;

    function expectNoReserveField(body: unknown): void {
      const reserveKeys = [...collectKeys(body)].filter((key) => /reserve/i.test(key) && key !== 'reserveStatus');
      expect(reserveKeys).toEqual([]);
    }

    it('never appears in any response, only reserveStatus does', async () => {
      const created = await api.create('rafael_ortiz', {
        artworkSlug: 'desert-geometry',
        startingPriceCents: 100_00,
        reservePriceCents: RESERVE_CENTS,
        endsAt: ENDS_AT.toISOString(),
      });
      const slug = created.json().slug as string;
      const firstBid = await api.bid('ada_mensah', slug, 500_00);
      const secondBid = await api.bid('bianca_rossi', slug, 300_00);

      const responses = [
        created,
        firstBid,
        secondBid,
        await api.list(),
        await api.list('?status=all'),
        await api.get(slug),
        await api.get(slug, 'rafael_ortiz'), // even the seller who set it
        await api.get(slug, 'ada_mensah'),
        await api.get(slug, 'bianca_rossi'),
      ];
      for (const response of responses) {
        expect(response.statusCode).toBeLessThan(300);
        expect(response.body).not.toContain(String(RESERVE_CENTS));
        expectNoReserveField(response.json());
      }
      expect((await api.get(slug)).json().reserveStatus).toBe('not_met');
    });

    it('turns met when a maximum reaches it, lifting the price to the reserve', async () => {
      const slug = await openAuction({ reservePriceCents: RESERVE_CENTS });
      await api.bid('ada_mensah', slug, 500_00);

      const response = await api.bid('bianca_rossi', slug, 900_00);

      // Inherent in a reserve auction: once met, the price shows the bidders where it was.
      expect(response.json()).toMatchObject({ leading: true, priceCents: RESERVE_CENTS });
      const detail = (await api.get(slug)).json();
      expect(detail.reserveStatus).toBe('met');
      expectNoReserveField(detail);
    });
  });
});
