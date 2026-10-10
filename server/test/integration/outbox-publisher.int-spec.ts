import type { TestingModule } from '@nestjs/testing';
import type { Pool } from 'pg';
import { Clock } from '../../src/common/clock';
import { MESSAGE_PUBLISHER } from '../../src/common/messaging';
import { UnitOfWork } from '../../src/database';
import { AuctionClosedPayload, OutboxPublisherService, OutboxPublishingModule, OutboxService } from '../../src/modules/outbox';
import { ControllableMessagePublisher } from '../support/controllable-message-publisher';
import { createTestContext } from '../support/create-test-context';
import { FakeClock } from '../support/fake-clock';
import { createTestPool, prepareTestDatabase, truncateAllTables } from '../support/test-database';
import { waitFor } from '../support/wait-for';

const START = new Date('2026-01-15T12:00:00.000Z');

interface StoredEvent {
  id: string;
  published_at: Date | null;
  claim_expires_at: Date | null;
  publish_attempt_count: number;
  last_publish_error: string | null;
}

describe('outbox publisher', () => {
  const clock = new FakeClock(START);
  const broker = new ControllableMessagePublisher();
  let pool: Pool;
  let context: TestingModule;
  let publisher: OutboxPublisherService;
  let outbox: OutboxService;
  let unitOfWork: UnitOfWork;

  beforeAll(async () => {
    await prepareTestDatabase();
    pool = createTestPool();
    context = await createTestContext({
      imports: [OutboxPublishingModule],
      configure: (builder) =>
        builder.overrideProvider(Clock).useValue(clock).overrideProvider(MESSAGE_PUBLISHER).useValue(broker),
    });
    publisher = context.get(OutboxPublisherService, { strict: false });
    outbox = context.get(OutboxService, { strict: false });
    unitOfWork = context.get(UnitOfWork, { strict: false });
  });

  afterAll(async () => {
    broker.reset();
    await context.close();
    await pool.end();
  });

  beforeEach(async () => {
    broker.reset();
    await truncateAllTables(pool);
    clock.setTo(START);
  });

  let auctionNumber = 0;
  function auctionClosed(): AuctionClosedPayload {
    auctionNumber += 1;
    const id = `5eed0000-0000-4000-8000-${String(auctionNumber).padStart(12, '0')}`;
    return {
      auctionId: id,
      auctionSlug: `lot-${auctionNumber}`,
      artworkTitle: `Lot ${auctionNumber}`,
      sellerUserId: id,
      outcome: 'no_bids',
      winningUserId: null,
      leadingBidderUserId: null,
      hammerPriceCents: null,
      closedAt: START.toISOString(),
    };
  }

  async function recordEvents(count: number): Promise<string[]> {
    const ids: string[] = [];
    for (let index = 0; index < count; index += 1) {
      ids.push(await unitOfWork.run(() => outbox.recordEvent('AuctionClosed', auctionClosed())));
      clock.advanceBySeconds(1);
    }
    return ids;
  }

  async function loadEvents(): Promise<StoredEvent[]> {
    return (
      await pool.query<StoredEvent>(
        `SELECT id, published_at, claim_expires_at, publish_attempt_count, last_publish_error
           FROM outbox_events ORDER BY occurred_at, id`,
      )
    ).rows;
  }

  it('marks events published only after the broker confirms them', async () => {
    const eventIds = await recordEvents(2);
    broker.mode = 'manual';

    const batch = publisher.publishPendingBatch();
    await waitFor(() => broker.pendingCount === 2, { description: 'both publishes to be in flight' });

    // Sent but not confirmed: still pending.
    expect((await loadEvents()).map((event) => event.published_at)).toEqual([null, null]);

    broker.confirmPending();
    expect(await batch).toEqual({ published: 2, failed: 0 });

    const events = await loadEvents();
    expect(events.every((event) => event.published_at !== null && event.claim_expires_at === null)).toBe(true);
    expect(broker.published.map((message) => message.messageId)).toEqual(eventIds);
    expect(broker.published[0]).toMatchObject({
      routingKey: 'auction.closed',
      type: 'AuctionClosed',
      body: expect.objectContaining({ auctionSlug: expect.stringMatching(/^lot-/) }),
    });
  });

  it('leaves an event pending when its confirm fails, and publishes it again with the same message ID', async () => {
    const [eventId] = await recordEvents(1);
    broker.mode = 'fail';

    expect(await publisher.publishPendingBatch()).toEqual({ published: 0, failed: 1 });
    expect(await loadEvents()).toEqual([
      {
        id: eventId,
        published_at: null,
        claim_expires_at: null,
        publish_attempt_count: 1,
        last_publish_error: expect.stringContaining('nack'),
      },
    ]);

    broker.mode = 'confirm';
    expect(await publisher.publishPendingBatch()).toEqual({ published: 1, failed: 0 });
    const [event] = await loadEvents();
    expect(event).toMatchObject({ publish_attempt_count: 2, last_publish_error: null });
    expect(event!.published_at).not.toBeNull();
    expect(broker.published.map((message) => message.messageId)).toEqual([eventId, eventId]);
  });

  it('confirms some and retries the rest when only part of a batch fails', async () => {
    const [firstId, secondId] = await recordEvents(2);
    broker.mode = 'manual';
    const batch = publisher.publishPendingBatch();
    await waitFor(() => broker.pendingCount === 2);

    broker.confirmNext();
    broker.failNext();

    expect(await batch).toEqual({ published: 1, failed: 1 });
    const eventsById = new Map((await loadEvents()).map((event) => [event.id, event]));
    expect(eventsById.get(firstId!)!.published_at).not.toBeNull();
    expect(eventsById.get(secondId!)!.published_at).toBeNull();
  });

  it('does not publish an event another publisher holds a lease on, until the lease expires', async () => {
    const [eventId] = await recordEvents(1);
    broker.mode = 'manual';

    // The first publisher claims it and stalls before the confirm.
    const stalledBatch = publisher.publishPendingBatch();
    await waitFor(() => broker.pendingCount === 1);

    expect(await publisher.publishPendingBatch()).toEqual({ published: 0, failed: 0 });
    expect(broker.published).toHaveLength(1);

    // After the lease expires the event is sent again, with the same ID.
    clock.advanceBySeconds(31);
    const retriedBatch = publisher.publishPendingBatch();
    await waitFor(() => broker.pendingCount === 2);
    expect(broker.published.map((message) => message.messageId)).toEqual([eventId, eventId]);

    broker.confirmPending();
    await Promise.all([stalledBatch, retriedBatch]);
    expect((await loadEvents())[0]!.published_at).not.toBeNull();
  });

  it('never republishes an event that was already confirmed', async () => {
    await recordEvents(3);
    expect(await publisher.publishPendingBatch()).toEqual({ published: 3, failed: 0 });
    clock.advanceBySeconds(3_600);
    expect(await publisher.publishPendingBatch()).toEqual({ published: 0, failed: 0 });
    expect(broker.published).toHaveLength(3);
  });

  it('publishes in the order the events occurred', async () => {
    const eventIds = await recordEvents(5);
    await publisher.publishPendingBatch();
    expect(broker.published.map((message) => message.messageId)).toEqual(eventIds);
  });
});
