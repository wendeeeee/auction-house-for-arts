import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { Pool } from 'pg';
import { Clock } from '../../src/common/clock';
import { seedCatalog } from '../../src/database/seed/seed-catalog';
import { auctionApi, seedUserId } from '../support/auction-api';
import { createTestApp } from '../support/create-test-app';
import { FakeClock } from '../support/fake-clock';
import { createTestPool, prepareTestDatabase, truncateAllTables } from '../support/test-database';

const START = new Date('2026-01-15T12:00:00.000Z');
const secondsAfterStart = (seconds: number): string => new Date(START.getTime() + seconds * 1_000).toISOString();
const HOUR = 3_600;
const DAY = 24 * HOUR;

describe('auctions API', () => {
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

  describe('POST /api/auctions', () => {
    it('lets the owner put an artwork up, starting at the starting price with no bids', async () => {
      const response = await api.create('rafael_ortiz', {
        artworkSlug: 'desert-geometry',
        startingPriceCents: 100_00,
        reservePriceCents: 400_00,
        endsAt: secondsAfterStart(DAY),
      });

      expect(response.statusCode).toBe(201);
      expect(response.json()).toEqual({
        slug: expect.stringMatching(/^desert-geometry-[a-z0-9]{6}$/),
        artwork: expect.objectContaining({ slug: 'desert-geometry', medium: 'Painting', saleType: 'primary' }),
        status: 'open',
        startingPriceCents: 100_00,
        priceCents: 100_00,
        bidCount: 0,
        reserveStatus: 'not_met',
        endsAt: secondsAfterStart(DAY),
        originalEndsAt: secondsAfterStart(DAY),
        extensionCount: 0,
        sellerHandle: 'rafael_ortiz',
        leaderHandle: null,
        minimumNextBidCents: 100_00,
        history: [],
        yourMaxBidCents: null,
        youAreLeading: false,
        youMayBid: false,
      });
    });

    it('shows reserveStatus none without a reserve, and lets other users bid', async () => {
      const created = await api.create('rafael_ortiz', {
        artworkSlug: 'desert-geometry',
        startingPriceCents: 100_00,
        endsAt: secondsAfterStart(DAY),
      });
      expect(created.json().reserveStatus).toBe('none');

      const asCollector = await api.get(created.json().slug, 'ada_mensah');
      expect(asCollector.json()).toMatchObject({ youMayBid: true, reserveStatus: 'none' });
    });

    it('lets a collector resell a work they own, but not the artist who no longer owns it', async () => {
      const body = { artworkSlug: 'lagos-at-dusk', startingPriceCents: 1_000_00, endsAt: secondsAfterStart(DAY) };

      const byArtist = await api.create('amara_okafor', body);
      expect(byArtist.statusCode).toBe(403);
      expect(byArtist.json().error).toMatchObject({ code: 'NOT_ARTWORK_OWNER', details: { artworkSlug: 'lagos-at-dusk' } });

      const byOwner = await api.create('bianca_rossi', body);
      expect(byOwner.statusCode).toBe(201);
      expect(byOwner.json().artwork.saleType).toBe('resale');
    });

    it('requires a user', async () => {
      const response = await api.create(null, {
        artworkSlug: 'desert-geometry',
        startingPriceCents: 100_00,
        endsAt: secondsAfterStart(DAY),
      });
      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe('UNAUTHENTICATED');
    });

    it('answers ARTWORK_NOT_FOUND for an unknown artwork', async () => {
      const response = await api.create('rafael_ortiz', {
        artworkSlug: 'no-such-artwork',
        startingPriceCents: 100_00,
        endsAt: secondsAfterStart(DAY),
      });
      expect(response.statusCode).toBe(404);
      expect(response.json().error.code).toBe('ARTWORK_NOT_FOUND');
    });

    it.each([
      ['119 seconds away', 119, 400],
      ['exactly 2 minutes away', 120, 201],
      ['exactly 14 days away', 14 * DAY, 201],
      ['14 days and a second away', 14 * DAY + 1, 400],
    ])('judges an end %s by the injected clock', async (_case, seconds, status) => {
      const response = await api.create('rafael_ortiz', {
        artworkSlug: 'desert-geometry',
        startingPriceCents: 100_00,
        endsAt: secondsAfterStart(seconds),
      });

      expect(response.statusCode).toBe(status);
      if (status === 400) {
        expect(response.json().error).toMatchObject({
          code: 'VALIDATION_FAILED',
          details: { fieldErrors: [{ path: 'endsAt', message: expect.any(String) }] },
        });
      }
    });

    it('rejects malformed bodies field by field', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auctions',
        headers: { 'x-demo-user-id': seedUserId('rafael_ortiz') },
        payload: { artworkSlug: 'Desert Geometry', startingPriceCents: 99, endsAt: 'tomorrow' },
      });

      expect(response.statusCode).toBe(400);
      const paths = response.json().error.details.fieldErrors.map((fieldError: { path: string }) => fieldError.path);
      expect(paths).toEqual(['artworkSlug', 'startingPriceCents', 'endsAt']);
    });

    it('rejects a reserve below the starting price', async () => {
      const response = await api.create('rafael_ortiz', {
        artworkSlug: 'desert-geometry',
        startingPriceCents: 500_00,
        reservePriceCents: 499_99,
        endsAt: secondsAfterStart(DAY),
      });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.details.fieldErrors).toEqual([
        { path: 'reservePriceCents', message: 'must be at least the starting price' },
      ]);
    });

    it('allows one unclosed auction per artwork, even after the first has ended', async () => {
      const body = { artworkSlug: 'desert-geometry', startingPriceCents: 100_00, endsAt: secondsAfterStart(HOUR) };
      expect((await api.create('rafael_ortiz', body)).statusCode).toBe(201);

      const again = await api.create('rafael_ortiz', body);
      expect(again.statusCode).toBe(409);
      expect(again.json().error).toMatchObject({
        code: 'ARTWORK_ALREADY_AT_AUCTION',
        details: { artworkSlug: 'desert-geometry' },
      });

      // Ended but not yet closed (closing arrives in phase 4): still blocks a relisting.
      clock.advanceBySeconds(2 * HOUR);
      const afterEnd = await api.create('rafael_ortiz', { ...body, endsAt: secondsAfterStart(3 * HOUR) });
      expect(afterEnd.json().error.code).toBe('ARTWORK_ALREADY_AT_AUCTION');
    });
  });

  describe('GET /api/auctions/:slug', () => {
    it('answers AUCTION_NOT_FOUND for an unknown slug', async () => {
      const response = await api.get('no-such-auction');
      expect(response.statusCode).toBe(404);
      expect(response.json().error).toMatchObject({ code: 'AUCTION_NOT_FOUND', details: { slug: 'no-such-auction' } });
    });
  });

  describe('GET /api/auctions', () => {
    let painting: string; // ends first, $100, no bids
    let sculpture: string; // ends second, $105 after three history rows ($100 runner-up + $5)
    let print: string; // ends last, $20, no bids

    beforeEach(async () => {
      const create = async (sellerHandle: string, artworkSlug: string, startingPriceCents: number, endsInSeconds: number) => {
        const response = await api.create(sellerHandle, {
          artworkSlug,
          startingPriceCents,
          endsAt: secondsAfterStart(endsInSeconds),
        });
        expect(response.statusCode).toBe(201);
        return response.json().slug as string;
      };
      painting = await create('rafael_ortiz', 'desert-geometry', 100_00, HOUR);
      sculpture = await create('mei_tanaka', 'tide-vessel', 50_00, 2 * HOUR);
      print = await create('rafael_ortiz', 'blue-hour-serigraph', 20_00, 3 * HOUR);

      expect((await api.bid('ada_mensah', sculpture, 300_00)).statusCode).toBe(201);
      expect((await api.bid('bianca_rossi', sculpture, 100_00)).statusCode).toBe(201);
    });

    async function listSlugs(queryString: string): Promise<string[]> {
      const response = await api.list(queryString);
      expect(response.statusCode).toBe(200);
      return response.json().items.map((item: { slug: string }) => item.slug);
    }

    it('lists open auctions ending soonest first by default, as summaries', async () => {
      expect(await listSlugs('')).toEqual([painting, sculpture, print]);

      const { items } = (await api.list('?medium=Sculpture')).json();
      expect(items).toEqual([
        {
          slug: sculpture,
          artwork: expect.objectContaining({ slug: 'tide-vessel', title: 'Tide Vessel' }),
          status: 'open',
          startingPriceCents: 50_00,
          priceCents: 105_00,
          bidCount: 3,
          reserveStatus: 'none',
          endsAt: secondsAfterStart(2 * HOUR),
          extensionCount: 0,
        },
      ]);
    });

    it.each([
      ['price_low', () => [print, painting, sculpture]],
      ['price_high', () => [sculpture, painting, print]],
      ['most_bids', () => [sculpture, painting, print]],
      ['ending_soon', () => [painting, sculpture, print]],
    ])('sorts by %s', async (sort, expected) => {
      expect(await listSlugs(`?sort=${sort}`)).toEqual(expected());
    });

    it('filters by artwork, combined with medium, matching nothing for an unknown artwork', async () => {
      expect(await listSlugs('?artwork=tide-vessel')).toEqual([sculpture]);
      expect(await listSlugs('?artwork=tide-vessel&medium=Sculpture')).toEqual([sculpture]);
      expect(await listSlugs('?artwork=tide-vessel&medium=Painting')).toEqual([]);
      expect(await listSlugs('?artwork=no-such-artwork')).toEqual([]);
    });

    it('splits open and ended by the injected clock', async () => {
      clock.advanceBySeconds(1.5 * HOUR);

      expect(await listSlugs('')).toEqual([sculpture, print]);
      expect(await listSlugs('?status=ended')).toEqual([painting]);
      expect(await listSlugs('?status=all')).toEqual([painting, sculpture, print]);
      expect((await api.list('?status=ended')).json().items[0].status).toBe('ended');
    });

    it('rejects an unknown sort or status', async () => {
      const response = await api.list('?sort=cheapest&status=sold');
      expect(response.statusCode).toBe(400);
      expect(response.json().error.details.fieldErrors.map((fieldError: { path: string }) => fieldError.path)).toEqual([
        'status',
        'sort',
      ]);
    });
  });
});
