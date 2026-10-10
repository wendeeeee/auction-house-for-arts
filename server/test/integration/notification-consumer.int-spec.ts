import { randomUUID } from 'node:crypto';
import type { TestingModule } from '@nestjs/testing';
import type { Pool } from 'pg';
import { Clock } from '../../src/common/clock';
import { DEFAULT_MESSAGING_TOPOLOGY, IncomingMessage, RabbitMqConnection } from '../../src/common/messaging';
import { AuctionClosedConsumer, NotificationService, NotificationsModule } from '../../src/modules/notifications';
import type { AuctionClosedPayload } from '../../src/modules/outbox';
import { REALTIME_EMITTER } from '../../src/modules/realtime';
import { insertUser } from '../support/catalog-fixtures';
import { CapturingRealtimeEmitter } from '../support/capturing-realtime-emitter';
import { createTestContext } from '../support/create-test-context';
import { FakeClock } from '../support/fake-clock';
import { createTestPool, prepareTestDatabase, truncateAllTables } from '../support/test-database';

const START = new Date('2026-01-15T13:00:00.000Z');

/** A redelivery is `handle` called again with the same message; the broker side is in rabbitmq-messaging. */
describe('AuctionClosed notification consumer', () => {
  const clock = new FakeClock(START);
  const emitter = new CapturingRealtimeEmitter();
  let pool: Pool;
  let context: TestingModule;
  let consumer: AuctionClosedConsumer;
  let sellerUserId: string;
  let winnerUserId: string;

  beforeAll(async () => {
    await prepareTestDatabase();
    pool = createTestPool();
    context = await createTestContext({
      imports: [NotificationsModule],
      configure: (builder) => builder.overrideProvider(Clock).useValue(clock).overrideProvider(REALTIME_EMITTER).useValue(emitter),
    });
    const unusedConnection = new RabbitMqConnection('amqp://localhost:1', DEFAULT_MESSAGING_TOPOLOGY);
    consumer = new AuctionClosedConsumer(unusedConnection, context.get(NotificationService, { strict: false }));
  });

  afterAll(async () => {
    await context.close();
    await pool.end();
  });

  beforeEach(async () => {
    await truncateAllTables(pool);
    emitter.clear();
    clock.setTo(START);
    sellerUserId = await insertUser(pool);
    winnerUserId = await insertUser(pool);
  });

  function soldEvent(overrides: Partial<AuctionClosedPayload> = {}): AuctionClosedPayload {
    return {
      auctionId: randomUUID(),
      auctionSlug: 'harbour-at-noon-lot-1',
      artworkTitle: 'Harbour at Noon',
      sellerUserId,
      outcome: 'sold',
      winningUserId: winnerUserId,
      leadingBidderUserId: winnerUserId,
      hammerPriceCents: 310_00,
      closedAt: START.toISOString(),
      ...overrides,
    };
  }

  const delivery = (body: unknown, overrides: Partial<IncomingMessage> = {}): IncomingMessage => ({
    messageId: randomUUID(),
    type: 'AuctionClosed',
    body,
    deliveryCount: 1,
    ...overrides,
  });

  async function loadDeliveries() {
    return (
      await pool.query<{ event_id: string; recipient_user_id: string; kind: string; read_at: Date | null }>(
        'SELECT event_id, recipient_user_id, kind, read_at FROM notification_deliveries ORDER BY kind',
      )
    ).rows;
  }

  it('stores one notification per recipient and alerts each recipient once', async () => {
    const message = delivery(soldEvent());

    expect(await consumer.handle(message)).toBe('ack');

    expect(await loadDeliveries()).toEqual([
      { event_id: message.messageId, recipient_user_id: winnerUserId, kind: 'bidder_auction_won', read_at: null },
      { event_id: message.messageId, recipient_user_id: sellerUserId, kind: 'seller_auction_closed', read_at: null },
    ]);
    expect(emitter.emits).toHaveLength(2);
    expect(emitter.emits.find((emit) => emit.target === winnerUserId)).toEqual({
      room: 'user',
      target: winnerUserId,
      eventName: 'notification:created',
      payload: {
        id: expect.any(String),
        kind: 'bidder_auction_won',
        auctionSlug: 'harbour-at-noon-lot-1',
        artworkTitle: 'Harbour at Noon',
        outcome: 'sold',
        hammerPriceCents: 310_00,
        earnedCents: null,
        createdAt: START.toISOString(),
        readAt: null,
      },
    });
  });

  it('is idempotent: the same event delivered again creates no second notification and no second alert', async () => {
    const message = delivery(soldEvent());
    expect(await consumer.handle(message)).toBe('ack');
    emitter.clear();

    // The worker died after storing but before acking.
    clock.advanceBySeconds(30);
    expect(await consumer.handle({ ...message, deliveryCount: 2 })).toBe('ack');

    expect(await loadDeliveries()).toHaveLength(2);
    expect(emitter.emits).toEqual([]);
  });

  it('tells the highest bidder when the reserve was not met, and only the seller when nobody bid', async () => {
    await consumer.handle(
      delivery(soldEvent({ outcome: 'reserve_not_met', winningUserId: null, hammerPriceCents: null })),
    );
    await consumer.handle(
      delivery(soldEvent({ outcome: 'no_bids', winningUserId: null, leadingBidderUserId: null, hammerPriceCents: null })),
    );

    const kinds = (await loadDeliveries()).map((row) => `${row.kind}:${row.recipient_user_id === sellerUserId ? 'seller' : 'bidder'}`);
    expect(kinds.sort()).toEqual(['bidder_reserve_not_met:bidder', 'seller_auction_closed:seller', 'seller_auction_closed:seller']);
  });

  describe('messages that can never succeed are dead-lettered, without storing anything', () => {
    it.each<{ name: string; message: () => IncomingMessage }>([
      { name: 'a payload that fails the event schema', message: () => delivery({ ...soldEvent(), hammerPriceCents: 'lots' }) },
      { name: 'a sale without a winner', message: () => delivery({ ...soldEvent(), winningUserId: null }) },
      { name: 'a missing message ID', message: () => delivery(soldEvent(), { messageId: undefined }) },
      { name: 'a message ID that is not a UUID', message: () => delivery(soldEvent(), { messageId: 'event-1' }) },
      { name: 'another event type', message: () => delivery(soldEvent(), { type: 'PurchasePaid' }) },
    ])('$name', async ({ message }) => {
      expect(await consumer.handle(message())).toBe('dead_letter');
      expect(await loadDeliveries()).toEqual([]);
      expect(emitter.emits).toEqual([]);
    });
  });

  it('lets a storage failure propagate, so the consumer retries it, and stores nothing partial', async () => {
    // Schema-valid, but the winner is not a user: the foreign key fails the whole insert.
    const unknownUserId = randomUUID();
    const message = delivery(soldEvent({ winningUserId: unknownUserId, leadingBidderUserId: unknownUserId }));

    await expect(consumer.handle(message)).rejects.toThrow();
    expect(await loadDeliveries()).toEqual([]);
    expect(emitter.emits).toEqual([]);
  });
});
