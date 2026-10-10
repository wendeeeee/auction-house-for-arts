import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { Pool } from 'pg';
import { Clock } from '../../src/common/clock';
import { seedCatalog } from '../../src/database/seed/seed-catalog';
import { NotificationService } from '../../src/modules/notifications';
import type { AuctionClosedPayload } from '../../src/modules/outbox';
import { REALTIME_EMITTER } from '../../src/modules/realtime';
import { seedUserId } from '../support/auction-api';
import { CapturingRealtimeEmitter } from '../support/capturing-realtime-emitter';
import { createTestApp } from '../support/create-test-app';
import { FakeClock } from '../support/fake-clock';
import { createTestPool, prepareTestDatabase, truncateAllTables } from '../support/test-database';

const CLOSED_AT = new Date('2026-01-15T13:00:00.000Z');

describe('notifications API', () => {
  let app: NestFastifyApplication;
  let pool: Pool;
  const clock = new FakeClock(CLOSED_AT);
  const emitter = new CapturingRealtimeEmitter();

  beforeAll(async () => {
    await prepareTestDatabase();
    pool = createTestPool();
    app = await createTestApp({
      configure: (builder) => builder.overrideProvider(Clock).useValue(clock).overrideProvider(REALTIME_EMITTER).useValue(emitter),
    });
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  beforeEach(async () => {
    await truncateAllTables(pool);
    await seedCatalog(pool);
    clock.setTo(CLOSED_AT);
    emitter.clear();
  });

  const asUser = (handle: string | null): Record<string, string> =>
    handle === null ? {} : { 'x-demo-user-id': seedUserId(handle) };
  const listNotifications = (handle: string | null) =>
    app.inject({ method: 'GET', url: '/api/notifications', headers: asUser(handle) });
  const markRead = (handle: string | null, notificationId: string) =>
    app.inject({ method: 'POST', url: `/api/notifications/${notificationId}/read`, headers: asUser(handle) });

  /** Rafael sold to Ada while neither was connected. */
  async function deliverSale(): Promise<void> {
    const event: AuctionClosedPayload = {
      auctionId: randomUUID(),
      auctionSlug: 'desert-geometry-lot-9',
      artworkTitle: 'Desert Geometry',
      sellerUserId: seedUserId('rafael_ortiz'),
      outcome: 'sold',
      winningUserId: seedUserId('ada_mensah'),
      leadingBidderUserId: seedUserId('ada_mensah'),
      hammerPriceCents: 450_00,
      closedAt: CLOSED_AT.toISOString(),
    };
    await app.get(NotificationService).deliverAuctionClosed(randomUUID(), event);
  }

  it('shows an offline user the outcome on their next visit, with an unread count', async () => {
    await deliverSale();
    clock.advanceBySeconds(6 * 3_600);

    const response = await listNotifications('ada_mensah');

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      items: [
        {
          id: expect.any(String),
          kind: 'bidder_auction_won',
          auctionSlug: 'desert-geometry-lot-9',
          artworkTitle: 'Desert Geometry',
          outcome: 'sold',
          hammerPriceCents: 450_00,
          earnedCents: null,
          createdAt: CLOSED_AT.toISOString(),
          readAt: null,
        },
      ],
      unreadCount: 1,
    });
    expect((await listNotifications('rafael_ortiz')).json()).toMatchObject({
      items: [{ kind: 'seller_auction_closed', outcome: 'sold' }],
      unreadCount: 1,
    });
  });

  it('lists only your own notifications', async () => {
    await deliverSale();
    expect((await listNotifications('bianca_rossi')).json()).toEqual({ items: [], unreadCount: 0 });
  });

  it('marks a notification read, idempotently, and lowers the unread count', async () => {
    await deliverSale();
    const [notification] = (await listNotifications('ada_mensah')).json().items;
    clock.advanceBySeconds(60);
    const readAt = clock.now().toISOString();

    const first = await markRead('ada_mensah', notification.id);
    expect(first.statusCode).toBe(200);
    expect(first.json()).toMatchObject({ id: notification.id, readAt });

    clock.advanceBySeconds(60);
    expect((await markRead('ada_mensah', notification.id)).json().readAt).toBe(readAt);
    expect((await listNotifications('ada_mensah')).json().unreadCount).toBe(0);
  });

  it('answers 404 for another user’s notification, exactly as for one that does not exist', async () => {
    await deliverSale();
    const [notification] = (await listNotifications('ada_mensah')).json().items;

    const someoneElses = await markRead('bianca_rossi', notification.id);
    const missing = await markRead('bianca_rossi', randomUUID());

    expect(someoneElses.statusCode).toBe(404);
    expect(someoneElses.json().error.code).toBe('NOTIFICATION_NOT_FOUND');
    expect(missing.statusCode).toBe(404);
    expect(missing.json().error.code).toBe('NOTIFICATION_NOT_FOUND');
    expect((await listNotifications('ada_mensah')).json().unreadCount).toBe(1);
  });

  it('rejects a notification ID that is not a UUID', async () => {
    const response = await markRead('ada_mensah', 'not-a-uuid');
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('VALIDATION_FAILED');
  });

  it('requires a user', async () => {
    expect((await listNotifications(null)).statusCode).toBe(401);
    expect((await markRead(null, randomUUID())).statusCode).toBe(401);
  });
});
