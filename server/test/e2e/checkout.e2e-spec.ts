import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { Pool } from 'pg';
import { Clock } from '../../src/common/clock';
import { seedCatalog } from '../../src/database/seed/seed-catalog';
import { FakePaymentsProvider, PAYMENTS_PROVIDER } from '../../src/modules/payments';
import { REALTIME_EMITTER } from '../../src/modules/realtime';
import { seedUserId } from '../support/auction-api';
import { CapturingRealtimeEmitter } from '../support/capturing-realtime-emitter';
import { createTestApp } from '../support/create-test-app';
import { FakeClock } from '../support/fake-clock';
import { runAuctionToClose } from '../support/sold-auction';
import { createTestPool, prepareTestDatabase, truncateAllTables } from '../support/test-database';

const START = new Date('2026-01-15T12:00:00.000Z');

const asUser = (handle: string | null): Record<string, string> =>
  handle === null ? {} : { 'x-demo-user-id': seedUserId(handle) };

function checkoutApi(app: NestFastifyApplication) {
  return {
    start: (handle: string | null, slug: string) =>
      app.inject({ method: 'POST', url: `/api/auctions/${slug}/checkout`, headers: asUser(handle) }),
    status: (handle: string | null, slug: string) =>
      app.inject({ method: 'GET', url: `/api/auctions/${slug}/checkout`, headers: asUser(handle) }),
  };
}

describe('checkout API', () => {
  let app: NestFastifyApplication;
  let pool: Pool;
  let checkout: ReturnType<typeof checkoutApi>;
  const clock = new FakeClock(START);
  const payments = new FakePaymentsProvider();

  beforeAll(async () => {
    await prepareTestDatabase();
    pool = createTestPool();
    app = await createTestApp({
      configure: (builder) =>
        builder
          .overrideProvider(Clock)
          .useValue(clock)
          .overrideProvider(REALTIME_EMITTER)
          .useValue(new CapturingRealtimeEmitter())
          .overrideProvider(PAYMENTS_PROVIDER)
          .useValue(payments),
    });
    checkout = checkoutApi(app);
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  beforeEach(async () => {
    await truncateAllTables(pool);
    await seedCatalog(pool);
    clock.setTo(START);
    payments.reset();
  });

  /** Rafael sells his own "Desert Geometry"; Ada wins at $310 against Bianca's $300 maximum. */
  const sellToAda = (): Promise<string> =>
    runAuctionToClose(app, clock, {
      sellerHandle: 'rafael_ortiz',
      artworkSlug: 'desert-geometry',
      bids: [
        ['ada_mensah', 500_00],
        ['bianca_rossi', 300_00],
      ],
    });

  describe('POST /auctions/:slug/checkout', () => {
    it('gives the winner a checkout URL for the hammer price from the database', async () => {
      const slug = await sellToAda();

      const response = await checkout.start('ada_mensah', slug);

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        purchaseId: expect.any(String),
        amountCents: 310_00,
        currency: 'usd',
        checkoutUrl: expect.stringMatching(/^https:\/\/checkout\.fake\.test\//),
      });
      expect(payments.createRequests).toEqual([
        expect.objectContaining({
          purchaseId: response.json().purchaseId,
          amountCents: 310_00,
          currency: 'usd',
          productName: 'Desert Geometry by Rafael Ortiz',
          successUrl: `http://localhost:5201/auctions/${slug}/checkout/success`,
          cancelUrl: `http://localhost:5201/auctions/${slug}/checkout/cancelled`,
        }),
      ]);
    });

    it('ignores any amount the client sends', async () => {
      const slug = await sellToAda();

      const response = await app.inject({
        method: 'POST',
        url: `/api/auctions/${slug}/checkout`,
        headers: asUser('ada_mensah'),
        payload: { amountCents: 1 },
      });

      expect(response.json().amountCents).toBe(310_00);
    });

    it('reuses the open session on a retry instead of creating another', async () => {
      const slug = await sellToAda();

      const first = (await checkout.start('ada_mensah', slug)).json();
      const second = (await checkout.start('ada_mensah', slug)).json();

      expect(second).toEqual(first);
      expect(payments.createRequests).toHaveLength(1);
    });

    it('creates a new session once the old one expired, keeping the purchase ID and amount', async () => {
      const slug = await sellToAda();
      const first = (await checkout.start('ada_mensah', slug)).json();
      const { rows } = await pool.query<{ provider_session_id: string }>('SELECT provider_session_id FROM purchases');
      payments.expireSession(rows[0]!.provider_session_id);

      const second = (await checkout.start('ada_mensah', slug)).json();

      expect(second.checkoutUrl).not.toBe(first.checkoutUrl);
      expect(second).toMatchObject({ purchaseId: first.purchaseId, amountCents: 310_00 });
      expect(payments.createRequests.map((request) => request.amountCents)).toEqual([310_00, 310_00]);
      const stored = await pool.query('SELECT count(*)::int AS count FROM purchases');
      expect(stored.rows[0].count).toBe(1);
    });

    it('two concurrent first requests end with one purchase and one session', async () => {
      const slug = await sellToAda();

      const responses = await Promise.all([checkout.start('ada_mensah', slug), checkout.start('ada_mensah', slug)]);

      expect(responses.map((response) => response.statusCode)).toEqual([200, 200]);
      expect(responses[0]!.json()).toEqual(responses[1]!.json());
      const stored = await pool.query('SELECT count(*)::int AS count FROM purchases');
      expect(stored.rows[0].count).toBe(1);
    });

    it('lets only the winner start checkout', async () => {
      const slug = await sellToAda();

      for (const handle of ['bianca_rossi', 'rafael_ortiz', 'chidi_nwosu']) {
        const response = await checkout.start(handle, slug);
        expect(response.statusCode).toBe(403);
        expect(response.json().error.code).toBe('NOT_AUCTION_WINNER');
      }
      expect((await checkout.start(null, slug)).statusCode).toBe(401);
      expect(payments.createRequests).toHaveLength(0);
    });

    it('refuses an auction that did not sell, or has not closed', async () => {
      const unsold = await runAuctionToClose(app, clock, {
        sellerHandle: 'rafael_ortiz',
        artworkSlug: 'desert-geometry',
        reservePriceCents: 1_000_00,
        bids: [['ada_mensah', 500_00]],
      });
      const notSold = await checkout.start('ada_mensah', unsold);
      expect(notSold.statusCode).toBe(409);
      expect(notSold.json().error).toMatchObject({ code: 'AUCTION_NOT_SOLD', details: { outcome: 'reserve_not_met' } });

      const open = await app.inject({
        method: 'POST',
        url: '/api/auctions',
        headers: asUser('rafael_ortiz'),
        payload: { artworkSlug: 'desert-geometry', startingPriceCents: 100_00, endsAt: new Date(clock.now().getTime() + 3_600_000).toISOString() },
      });
      const notClosed = await checkout.start('ada_mensah', open.json().slug);
      expect(notClosed.json().error).toMatchObject({ code: 'AUCTION_NOT_SOLD', details: { outcome: 'not_closed' } });

      expect((await checkout.start('ada_mensah', 'no-such-auction')).statusCode).toBe(404);
    });

    it('says the payment is being confirmed when the buyer paid but the webhook has not landed', async () => {
      const slug = await sellToAda();
      await checkout.start('ada_mensah', slug);
      const { rows } = await pool.query<{ provider_session_id: string }>('SELECT provider_session_id FROM purchases');
      payments.completeSession(rows[0]!.provider_session_id);

      const response = await checkout.start('ada_mensah', slug);

      expect(response.statusCode).toBe(409);
      expect(response.json().error.code).toBe('PAYMENT_IN_PROGRESS');
      expect(payments.createRequests).toHaveLength(1);
    });

    it('refuses to start checkout for a purchase that is already paid', async () => {
      const slug = await sellToAda();
      await checkout.start('ada_mensah', slug);
      await pool.query(`UPDATE purchases SET status = 'paid', paid_at = now()`);

      const response = await checkout.start('ada_mensah', slug);

      expect(response.statusCode).toBe(409);
      expect(response.json().error.code).toBe('PURCHASE_ALREADY_PAID');
    });

    it('answers 502 when the provider fails, and works on the next try', async () => {
      const slug = await sellToAda();
      payments.setFailingOperation('create');

      const failed = await checkout.start('ada_mensah', slug);
      expect(failed.statusCode).toBe(502);
      expect(failed.json().error.code).toBe('PAYMENT_PROVIDER_ERROR');

      payments.setFailingOperation(null);
      expect((await checkout.start('ada_mensah', slug)).statusCode).toBe(200);
    });
  });

  describe('GET /auctions/:slug/checkout', () => {
    it('shows the winner the amount and status, before and after checkout starts', async () => {
      const slug = await sellToAda();

      expect((await checkout.status('ada_mensah', slug)).json()).toEqual({
        role: 'buyer',
        status: 'awaiting_payment',
        purchaseId: null,
        amountCents: 310_00,
        currency: 'usd',
        paidAt: null,
      });

      const { purchaseId } = (await checkout.start('ada_mensah', slug)).json();
      expect((await checkout.status('ada_mensah', slug)).json()).toMatchObject({ purchaseId, status: 'awaiting_payment' });
    });

    it('shows the seller only whether it has been paid', async () => {
      const slug = await sellToAda();
      await checkout.start('ada_mensah', slug);

      expect((await checkout.status('rafael_ortiz', slug)).json()).toEqual({ role: 'seller', status: 'awaiting_payment' });

      await pool.query(`UPDATE purchases SET status = 'paid', paid_at = now()`);
      expect((await checkout.status('rafael_ortiz', slug)).json()).toEqual({ role: 'seller', status: 'paid' });
      expect((await checkout.status('ada_mensah', slug)).json()).toMatchObject({ status: 'paid', paidAt: expect.any(String) });
    });

    it('is forbidden to anyone else, including the losing bidder', async () => {
      const slug = await sellToAda();

      for (const handle of ['bianca_rossi', 'chidi_nwosu']) {
        const response = await checkout.status(handle, slug);
        expect(response.statusCode).toBe(403);
        expect(response.json().error.code).toBe('NOT_PURCHASE_PARTY');
      }
      expect((await checkout.status(null, slug)).statusCode).toBe(401);
    });
  });

  it('the database refuses to change a purchase’s amount or buyer, or to un-pay it', async () => {
    const slug = await sellToAda();
    await checkout.start('ada_mensah', slug);

    await expect(pool.query('UPDATE purchases SET amount_cents = 1')).rejects.toMatchObject({ constraint: 'purchases_terms_immutable' });
    await expect(pool.query('UPDATE purchases SET buyer_user_id = $1', [seedUserId('bianca_rossi')])).rejects.toMatchObject({
      constraint: 'purchases_terms_immutable',
    });
    await pool.query(`UPDATE purchases SET status = 'paid', paid_at = now()`);
    await expect(pool.query(`UPDATE purchases SET status = 'pending', paid_at = NULL`)).rejects.toMatchObject({
      constraint: 'purchases_terms_immutable',
    });
  });
});

describe('checkout API without Stripe keys', () => {
  let app: NestFastifyApplication;
  let pool: Pool;
  const clock = new FakeClock(START);

  beforeAll(async () => {
    await prepareTestDatabase();
    pool = createTestPool();
    app = await createTestApp({
      configure: (builder) =>
        builder.overrideProvider(Clock).useValue(clock).overrideProvider(REALTIME_EMITTER).useValue(new CapturingRealtimeEmitter()),
    });
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  it('answers 503 PAYMENTS_UNAVAILABLE, while the rest of the app keeps working', async () => {
    await truncateAllTables(pool);
    await seedCatalog(pool);
    const slug = await runAuctionToClose(app, clock, {
      sellerHandle: 'rafael_ortiz',
      artworkSlug: 'desert-geometry',
      bids: [['ada_mensah', 500_00]],
    });

    const response = await checkoutApi(app).start('ada_mensah', slug);

    expect(response.statusCode).toBe(503);
    expect(response.json().error.code).toBe('PAYMENTS_UNAVAILABLE');
    expect((await checkoutApi(app).status('ada_mensah', slug)).statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: `/api/auctions/${slug}/outcome` })).statusCode).toBe(200);
  });
});
