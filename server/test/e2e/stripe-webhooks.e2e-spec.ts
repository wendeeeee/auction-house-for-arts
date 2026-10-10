import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { Pool } from 'pg';
import { Clock } from '../../src/common/clock';
import { seedCatalog } from '../../src/database/seed/seed-catalog';
import { FakePaymentsProvider, PAYMENTS_PROVIDER, SignedWebhook } from '../../src/modules/payments';
import { REALTIME_EMITTER } from '../../src/modules/realtime';
import { seedUserId } from '../support/auction-api';
import { CapturingRealtimeEmitter } from '../support/capturing-realtime-emitter';
import { createTestApp } from '../support/create-test-app';
import { FakeClock } from '../support/fake-clock';
import { runAuctionToClose } from '../support/sold-auction';
import { createTestPool, prepareTestDatabase, truncateAllTables } from '../support/test-database';

const START = new Date('2026-01-15T12:00:00.000Z');

const postWebhook = (app: NestFastifyApplication, body: string, signatureHeader?: string) =>
  app.inject({
    method: 'POST',
    url: '/api/webhooks/stripe',
    headers: { 'content-type': 'application/json', ...(signatureHeader === undefined ? {} : { 'stripe-signature': signatureHeader }) },
    payload: body,
  });

describe('POST /api/webhooks/stripe', () => {
  let app: NestFastifyApplication;
  let pool: Pool;
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

  const asUser = (handle: string) => ({ 'x-demo-user-id': seedUserId(handle) });

  /** Ada wins Rafael's "Desert Geometry" for $310 and opens checkout. Returns the payment webhook. */
  async function winAndPay(): Promise<{ auctionSlug: string; webhook: SignedWebhook }> {
    const auctionSlug = await runAuctionToClose(app, clock, {
      sellerHandle: 'rafael_ortiz',
      artworkSlug: 'desert-geometry',
      bids: [
        ['ada_mensah', 500_00],
        ['bianca_rossi', 300_00],
      ],
    });
    await app.inject({ method: 'POST', url: `/api/auctions/${auctionSlug}/checkout`, headers: asUser('ada_mensah') });
    const { rows } = await pool.query<{ provider_session_id: string }>('SELECT provider_session_id FROM purchases');
    return { auctionSlug, webhook: payments.completeSession(rows[0]!.provider_session_id) };
  }

  it('confirms the payment end to end: paid status, seller proceeds, new owner', async () => {
    const { auctionSlug, webhook } = await winAndPay();

    const response = await postWebhook(app, webhook.body, webhook.signatureHeader);

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ received: true, outcome: 'settled' });
    const status = await app.inject({ method: 'GET', url: `/api/auctions/${auctionSlug}/checkout`, headers: asUser('rafael_ortiz') });
    expect(status.json()).toEqual({ role: 'seller', status: 'paid' });
    const earnings = await app.inject({ method: 'GET', url: '/api/me/earnings', headers: asUser('rafael_ortiz') });
    expect(earnings.json()).toMatchObject({ sellerProceedsCents: 279_00 });
    const artwork = await app.inject({ method: 'GET', url: '/api/artworks/desert-geometry' });
    expect(artwork.json()).toMatchObject({ ownerUserId: seedUserId('ada_mensah'), saleType: 'resale' });
  });

  it('answers a replay with 200 and changes nothing', async () => {
    const { webhook } = await winAndPay();
    await postWebhook(app, webhook.body, webhook.signatureHeader);

    const replay = await postWebhook(app, webhook.body, webhook.signatureHeader);

    expect(replay.json()).toEqual({ received: true, outcome: 'duplicate' });
    const { rows } = await pool.query('SELECT count(*)::int AS count FROM ledger_transactions');
    expect(rows[0].count).toBe(1);
  });

  it.each`
    case                                    | mutate
    ${'a body changed after signing'}       | ${(webhook: SignedWebhook) => ({ body: webhook.body.replace('31000', '1'), header: webhook.signatureHeader })}
    ${'a forged signature'}                 | ${(webhook: SignedWebhook) => ({ body: webhook.body, header: 'sha256=00' })}
    ${'no signature header'}                | ${(webhook: SignedWebhook) => ({ body: webhook.body, header: undefined })}
    ${'the same JSON with other spacing'}   | ${(webhook: SignedWebhook) => ({ body: JSON.stringify(JSON.parse(webhook.body), null, 2), header: webhook.signatureHeader })}
  `('rejects $case with 400 before acting on it', async ({ mutate }) => {
    const { auctionSlug, webhook } = await winAndPay();
    const { body, header } = mutate(webhook);

    const response = await postWebhook(app, body, header);

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('INVALID_WEBHOOK_SIGNATURE');
    const { rows } = await pool.query('SELECT count(*)::int AS count FROM payment_events');
    expect(rows[0].count).toBe(0);
    const status = await app.inject({ method: 'GET', url: `/api/auctions/${auctionSlug}/checkout`, headers: asUser('ada_mensah') });
    expect(status.json().status).toBe('awaiting_payment');
  });
});

describe('POST /api/webhooks/stripe without Stripe keys', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    await prepareTestDatabase();
    app = await createTestApp({
      configure: (builder) => builder.overrideProvider(REALTIME_EMITTER).useValue(new CapturingRealtimeEmitter()),
    });
  });

  afterAll(async () => {
    await app.close();
  });

  it('answers 503 PAYMENTS_UNAVAILABLE', async () => {
    const response = await postWebhook(app, '{"id":"evt_1","type":"checkout.session.completed"}', 't=1,v1=abc');
    expect(response.statusCode).toBe(503);
    expect(response.json().error.code).toBe('PAYMENTS_UNAVAILABLE');
  });
});
