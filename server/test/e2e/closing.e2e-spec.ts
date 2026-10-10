import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { Pool } from 'pg';
import { Clock } from '../../src/common/clock';
import { seedCatalog } from '../../src/database/seed/seed-catalog';
import { AuctionCloseService } from '../../src/modules/closing';
import { REALTIME_EMITTER } from '../../src/modules/realtime';
import { auctionApi, collectKeys, seedUserId } from '../support/auction-api';
import { CapturingRealtimeEmitter } from '../support/capturing-realtime-emitter';
import { createTestApp } from '../support/create-test-app';
import { FakeClock } from '../support/fake-clock';
import { createTestPool, prepareTestDatabase, truncateAllTables } from '../support/test-database';

const START = new Date('2026-01-15T12:00:00.000Z');
const ENDS_AT = new Date(START.getTime() + 60 * 60 * 1_000);
const AFTER_END = new Date(ENDS_AT.getTime() + 5_000);

/** The test plays the close worker by calling AuctionCloseService. */
describe('auction outcome API', () => {
  let app: NestFastifyApplication;
  let pool: Pool;
  let api: ReturnType<typeof auctionApi>;
  const clock = new FakeClock(START);
  const emitter = new CapturingRealtimeEmitter();

  beforeAll(async () => {
    await prepareTestDatabase();
    pool = createTestPool();
    app = await createTestApp({
      configure: (builder) => builder.overrideProvider(Clock).useValue(clock).overrideProvider(REALTIME_EMITTER).useValue(emitter),
    });
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
    emitter.clear();
  });

  const getOutcome = (slug: string, handle: string | null = null) =>
    app.inject({
      method: 'GET',
      url: `/api/auctions/${slug}/outcome`,
      headers: handle === null ? {} : { 'x-demo-user-id': seedUserId(handle) },
    });

  async function openAuction(reservePriceCents?: number): Promise<string> {
    const response = await api.create('rafael_ortiz', {
      artworkSlug: 'desert-geometry',
      startingPriceCents: 100_00,
      reservePriceCents,
      endsAt: ENDS_AT.toISOString(),
    });
    expect(response.statusCode).toBe(201);
    return response.json().slug as string;
  }

  async function closeAsTheWorkerWould(): Promise<void> {
    clock.setTo(AFTER_END);
    expect(await app.get(AuctionCloseService).closeDueAuctions()).toMatchObject({ closed: 1, failed: 0 });
  }

  it('reports no outcome while the auction is open, or ended but not yet recorded', async () => {
    const slug = await openAuction();
    expect((await getOutcome(slug)).json()).toEqual({ isClosed: false });

    clock.setTo(AFTER_END);
    expect((await getOutcome(slug)).json()).toEqual({ isClosed: false });
  });

  it('shows a sale: the hammer price, the winner, and youWon for the winner only', async () => {
    const slug = await openAuction();
    clock.setTo(new Date(START.getTime() + 60_000));
    expect((await api.bid('ada_mensah', slug, 500_00)).statusCode).toBe(201);
    expect((await api.bid('bianca_rossi', slug, 300_00)).statusCode).toBe(201);

    await closeAsTheWorkerWould();

    const expected = {
      isClosed: true,
      outcome: 'sold',
      hammerPriceCents: 310_00,
      winnerHandle: 'ada_mensah',
      closedAt: AFTER_END.toISOString(),
    };
    expect((await getOutcome(slug, 'ada_mensah')).json()).toEqual({ ...expected, youWon: true });
    expect((await getOutcome(slug, 'bianca_rossi')).json()).toEqual({ ...expected, youWon: false });
    expect((await getOutcome(slug)).json()).toEqual({ ...expected, youWon: false });
    const keys = collectKeys((await getOutcome(slug, 'ada_mensah')).json());
    expect([...keys].filter((key) => /reserve|max/i.test(key))).toEqual([]);
  });

  it('shows a missed reserve without a winner or a price', async () => {
    const slug = await openAuction(1_000_00);
    clock.setTo(new Date(START.getTime() + 60_000));
    await api.bid('ada_mensah', slug, 800_00);

    await closeAsTheWorkerWould();

    expect((await getOutcome(slug, 'ada_mensah')).json()).toEqual({
      isClosed: true,
      outcome: 'reserve_not_met',
      hammerPriceCents: null,
      winnerHandle: null,
      closedAt: AFTER_END.toISOString(),
      youWon: false,
    });
  });

  it('tells the auction’s watchers to refetch once it closes', async () => {
    const slug = await openAuction();
    await closeAsTheWorkerWould();

    expect(emitter.emits).toEqual([{ room: 'auction', target: slug, eventName: 'auction:closed', payload: { slug } }]);
    expect((await api.get(slug)).json().status).toBe('ended');
  });

  it('rejects a bid on a closed auction with AUCTION_ENDED, even if ends_at is in the future', async () => {
    const slug = await openAuction();
    await closeAsTheWorkerWould();
    await pool.query(`UPDATE auctions SET ends_at = $2 WHERE slug = $1`, [slug, new Date(AFTER_END.getTime() + 3_600_000)]);

    const response = await api.bid('ada_mensah', slug, 500_00);

    expect(response.statusCode).toBe(409);
    expect(response.json().error.code).toBe('AUCTION_ENDED');
    expect((await api.get(slug, 'ada_mensah')).json()).toMatchObject({ status: 'ended', youMayBid: false });
  });

  it('answers 404 for an unknown auction', async () => {
    const response = await getOutcome('no-such-auction');
    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe('AUCTION_NOT_FOUND');
  });
});
