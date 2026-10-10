import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { Pool } from 'pg';
import { Clock } from '../../src/common/clock';
import { seedCatalog } from '../../src/database/seed/seed-catalog';
import { AUCTION_EVENT_PUBLISHER } from '../../src/modules/realtime';
import { auctionApi, collectKeys, seedUserId } from '../support/auction-api';
import { CapturingAuctionEventPublisher } from '../support/capturing-auction-event-publisher';
import { createTestApp } from '../support/create-test-app';
import { FakeClock } from '../support/fake-clock';
import { createTestPool, prepareTestDatabase, truncateAllTables } from '../support/test-database';

const START = new Date('2026-01-15T12:00:00.000Z');
const ENDS_AT = new Date(START.getTime() + 60 * 60 * 1_000);

describe('bid announcements (through HTTP, with a capturing publisher)', () => {
  let app: NestFastifyApplication;
  let pool: Pool;
  let api: ReturnType<typeof auctionApi>;
  const clock = new FakeClock(START);
  const publisher = new CapturingAuctionEventPublisher();

  beforeAll(async () => {
    await prepareTestDatabase();
    pool = createTestPool();
    app = await createTestApp({
      configure: (builder) =>
        builder.overrideProvider(Clock).useValue(clock).overrideProvider(AUCTION_EVENT_PUBLISHER).useValue(publisher),
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
  });

  /** Rafael sells his own Desert Geometry: $100 start, ending an hour after START. */
  async function openAuction(options: { reservePriceCents?: number } = {}): Promise<string> {
    const response = await api.create('rafael_ortiz', {
      artworkSlug: 'desert-geometry',
      startingPriceCents: 100_00,
      reservePriceCents: options.reservePriceCents,
      endsAt: ENDS_AT.toISOString(),
    });
    expect(response.statusCode).toBe(201);
    publisher.clear();
    return response.json().slug as string;
  }

  async function bidAccepted(handle: string, slug: string, maxBidCents: number): Promise<void> {
    expect((await api.bid(handle, slug, maxBidCents)).statusCode).toBe(201);
  }

  it('publishes exactly one auction:changed for an accepted bid, with public figures only', async () => {
    const reserveCents = 777_00;
    const slug = await openAuction({ reservePriceCents: reserveCents });

    await bidAccepted('ada_mensah', slug, 512_34);

    expect(publisher.announcements).toEqual([
      {
        auctionChanged: { slug, priceCents: 100_00, endsAt: ENDS_AT.toISOString(), extended: false },
        userOutbid: null,
      },
    ]);
    const serialized = JSON.stringify(publisher.announcements);
    expect(serialized).not.toContain('51234');
    expect(serialized).not.toContain(String(reserveCents));
    const keys = [...collectKeys(publisher.announcements)];
    expect(keys.filter((key) => /max|reserve|leader/i.test(key))).toEqual([]);
  });

  it('reports a soft-close extension with the new end', async () => {
    const slug = await openAuction();
    await bidAccepted('ada_mensah', slug, 500_00);
    publisher.clear();

    const bidAt = new Date(ENDS_AT.getTime() - 30_000);
    clock.setTo(bidAt);
    await bidAccepted('bianca_rossi', slug, 600_00);

    expect(publisher.announcements).toHaveLength(1);
    expect(publisher.announcements[0]?.auctionChanged).toEqual({
      slug,
      priceCents: 510_00,
      endsAt: new Date(bidAt.getTime() + 120_000).toISOString(),
      extended: true,
    });
  });

  it('alerts the previous leader, by ID, when the leader changes', async () => {
    const slug = await openAuction();
    await bidAccepted('ada_mensah', slug, 500_00);
    publisher.clear();

    await bidAccepted('bianca_rossi', slug, 600_00);

    expect(publisher.announcements).toHaveLength(1);
    expect(publisher.announcements[0]?.userOutbid).toEqual({
      userId: seedUserId('ada_mensah'),
      event: { slug, artworkTitle: 'Desert Geometry', priceCents: 510_00 },
    });
  });

  it('does not alert the leader when an existing maximum beats a bid at once', async () => {
    const slug = await openAuction();
    await bidAccepted('ada_mensah', slug, 500_00);
    publisher.clear();

    await bidAccepted('bianca_rossi', slug, 300_00);

    expect(publisher.announcements).toHaveLength(1);
    expect(publisher.announcements[0]).toMatchObject({ auctionChanged: { priceCents: 310_00 }, userOutbid: null });
  });

  it('publishes no outbid alert for a leader’s self-raise', async () => {
    const slug = await openAuction();
    await bidAccepted('ada_mensah', slug, 500_00);
    await bidAccepted('bianca_rossi', slug, 300_00);
    publisher.clear();

    await bidAccepted('ada_mensah', slug, 900_00);

    expect(publisher.announcements).toHaveLength(1);
    expect(publisher.announcements[0]?.userOutbid).toBeNull();
  });

  it('publishes nothing for a rejected bid', async () => {
    const slug = await openAuction();
    await bidAccepted('ada_mensah', slug, 500_00);
    publisher.clear();

    const rejections = [
      await api.bid('chidi_nwosu', slug, 104_99), // BID_TOO_LOW
      await api.bid('ada_mensah', slug, 500_00), // MAX_NOT_RAISED
      await api.bid('rafael_ortiz', slug, 900_00), // NOT_ALLOWED_TO_BID
      await api.bid('chidi_nwosu', 'no-such-auction', 900_00), // AUCTION_NOT_FOUND
      await api.bid('chidi_nwosu', slug, 'lots'), // VALIDATION_FAILED
    ];
    clock.setTo(ENDS_AT);
    rejections.push(await api.bid('chidi_nwosu', slug, 900_00)); // AUCTION_ENDED

    expect(rejections.map((response) => response.statusCode)).toEqual([409, 409, 409, 404, 400, 409]);
    expect(publisher.announcements).toEqual([]);
  });
});
