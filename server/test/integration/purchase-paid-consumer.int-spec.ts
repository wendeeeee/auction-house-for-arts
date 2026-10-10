import { randomUUID } from 'node:crypto';
import type { TestingModule } from '@nestjs/testing';
import type { Pool } from 'pg';
import { Clock } from '../../src/common/clock';
import { DEFAULT_MESSAGING_TOPOLOGY, IncomingMessage, RabbitMqConnection } from '../../src/common/messaging';
import { NotificationService, NotificationsModule, PurchasePaidConsumer } from '../../src/modules/notifications';
import type { PurchasePaidPayload } from '../../src/modules/outbox';
import { REALTIME_EMITTER } from '../../src/modules/realtime';
import { insertUser } from '../support/catalog-fixtures';
import { CapturingRealtimeEmitter } from '../support/capturing-realtime-emitter';
import { createTestContext } from '../support/create-test-context';
import { FakeClock } from '../support/fake-clock';
import { createTestPool, prepareTestDatabase, truncateAllTables } from '../support/test-database';

const PAID_AT = new Date('2026-01-15T14:00:00.000Z');

describe('PurchasePaid notification consumer', () => {
  const clock = new FakeClock(PAID_AT);
  const emitter = new CapturingRealtimeEmitter();
  let pool: Pool;
  let context: TestingModule;
  let consumer: PurchasePaidConsumer;
  let sellerUserId: string;
  let artistUserId: string;
  let buyerUserId: string;

  beforeAll(async () => {
    await prepareTestDatabase();
    pool = createTestPool();
    context = await createTestContext({
      imports: [NotificationsModule],
      configure: (builder) => builder.overrideProvider(Clock).useValue(clock).overrideProvider(REALTIME_EMITTER).useValue(emitter),
    });
    const unusedConnection = new RabbitMqConnection('amqp://localhost:1', DEFAULT_MESSAGING_TOPOLOGY);
    consumer = new PurchasePaidConsumer(unusedConnection, context.get(NotificationService, { strict: false }));
  });

  afterAll(async () => {
    await context.close();
    await pool.end();
  });

  beforeEach(async () => {
    await truncateAllTables(pool);
    emitter.clear();
    sellerUserId = await insertUser(pool);
    artistUserId = await insertUser(pool);
    buyerUserId = await insertUser(pool);
  });

  const resale = (): PurchasePaidPayload => ({
    purchaseId: randomUUID(),
    auctionId: randomUUID(),
    auctionSlug: 'harbour-lot-2',
    artworkTitle: 'Harbour',
    buyerUserId,
    sellerUserId,
    artistUserId,
    saleType: 'resale',
    amountCents: 1_000_00,
    platformFeeCents: 100_00,
    artistRoyaltyCents: 50_00,
    sellerProceedsCents: 850_00,
    paidAt: PAID_AT.toISOString(),
  });

  const delivery = (body: unknown, overrides: Partial<IncomingMessage> = {}): IncomingMessage => ({
    messageId: randomUUID(),
    type: 'PurchasePaid',
    body,
    deliveryCount: 1,
    ...overrides,
  });

  const loadDeliveries = async () =>
    (
      await pool.query<{ recipient_user_id: string; kind: string; payload: unknown }>(
        'SELECT recipient_user_id, kind, payload FROM notification_deliveries ORDER BY kind',
      )
    ).rows;

  it('tells the seller their proceeds and the artist their royalty, once each', async () => {
    const message = delivery(resale());

    expect(await consumer.handle(message)).toBe('ack');
    expect(await consumer.handle(message)).toBe('ack');

    expect(await loadDeliveries()).toEqual([
      {
        recipient_user_id: artistUserId,
        kind: 'artist_royalty_earned',
        payload: { auctionSlug: 'harbour-lot-2', artworkTitle: 'Harbour', outcome: 'sold', hammerPriceCents: 1_000_00, earnedCents: 50_00 },
      },
      {
        recipient_user_id: sellerUserId,
        kind: 'seller_purchase_paid',
        payload: { auctionSlug: 'harbour-lot-2', artworkTitle: 'Harbour', outcome: 'sold', hammerPriceCents: 1_000_00, earnedCents: 850_00 },
      },
    ]);
    expect(emitter.emits.map((emit) => emit.target).sort()).toEqual([sellerUserId, artistUserId].sort());
    expect(emitter.emits.every((emit) => emit.eventName === 'notification:created')).toBe(true);
  });

  it('dead-letters a payload whose split does not add up, storing nothing', async () => {
    const message = delivery({ ...resale(), sellerProceedsCents: 1 });

    expect(await consumer.handle(message)).toBe('dead_letter');
    expect(await loadDeliveries()).toEqual([]);
  });

  it('dead-letters a message of the wrong type', async () => {
    expect(await consumer.handle(delivery(resale(), { type: 'AuctionClosed' }))).toBe('dead_letter');
    expect(await loadDeliveries()).toEqual([]);
  });
});
