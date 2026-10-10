import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { Pool } from 'pg';
import { Clock } from '../../src/common/clock';
import { ErrorCode } from '../../src/common/errors';
import { seedCatalog } from '../../src/database/seed/seed-catalog';
import { FakePaymentsProvider, PAYMENTS_PROVIDER, SignedWebhook } from '../../src/modules/payments';
import { PurchaseSettlementService } from '../../src/modules/purchases';
import { REALTIME_EMITTER } from '../../src/modules/realtime';
import { seedUserId } from '../support/auction-api';
import { CapturingRealtimeEmitter } from '../support/capturing-realtime-emitter';
import { createTestApp } from '../support/create-test-app';
import { FakeClock } from '../support/fake-clock';
import { runAuctionToClose } from '../support/sold-auction';
import { createTestPool, prepareTestDatabase, truncateAllTables } from '../support/test-database';

const START = new Date('2026-01-15T12:00:00.000Z');

const CREATE_WIDENING_TRIGGER = `
  CREATE OR REPLACE FUNCTION test_widen_payment_event_race() RETURNS trigger AS $$
  BEGIN
    PERFORM pg_sleep(0.1);
    RETURN NEW;
  END
  $$ LANGUAGE plpgsql;
  DROP TRIGGER IF EXISTS test_widen_payment_event_race ON payment_events;
  CREATE TRIGGER test_widen_payment_event_race BEFORE INSERT ON payment_events
    FOR EACH ROW EXECUTE FUNCTION test_widen_payment_event_race();
`;
const DROP_WIDENING_TRIGGER = `
  DROP TRIGGER IF EXISTS test_widen_payment_event_race ON payment_events;
  DROP FUNCTION IF EXISTS test_widen_payment_event_race();
`;

describe('payment webhooks', () => {
  const clock = new FakeClock(START);
  const payments = new FakePaymentsProvider();
  let pool: Pool;
  /** Two API instances with separate pools, sharing one fake provider. */
  let app: NestFastifyApplication;
  let secondApp: NestFastifyApplication;

  const startApp = (): Promise<NestFastifyApplication> =>
    createTestApp({
      configure: (builder) =>
        builder
          .overrideProvider(Clock)
          .useValue(clock)
          .overrideProvider(REALTIME_EMITTER)
          .useValue(new CapturingRealtimeEmitter())
          .overrideProvider(PAYMENTS_PROVIDER)
          .useValue(payments),
    });

  beforeAll(async () => {
    await prepareTestDatabase();
    pool = createTestPool();
    app = await startApp();
    secondApp = await startApp();
  });

  afterAll(async () => {
    await pool.query(DROP_WIDENING_TRIGGER);
    await app.close();
    await secondApp.close();
    await pool.end();
  });

  beforeEach(async () => {
    await pool.query(DROP_WIDENING_TRIGGER);
    await truncateAllTables(pool);
    await seedCatalog(pool);
    clock.setTo(START);
    payments.reset();
  });

  const deliver = (webhook: SignedWebhook, target: NestFastifyApplication = app) =>
    target.get(PurchaseSettlementService).handleWebhook(Buffer.from(webhook.body), webhook.signatureHeader);

  const count = async (sql: string, parameters: unknown[] = []): Promise<number> =>
    (await pool.query<{ count: number }>(`SELECT count(*) AS count FROM ${sql}`, parameters)).rows[0]!.count;

  const ownerOf = async (artworkSlug: string): Promise<string> =>
    (await pool.query<{ owner_user_id: string }>('SELECT owner_user_id FROM artworks WHERE slug = $1', [artworkSlug])).rows[0]!
      .owner_user_id;

  const purchaseOf = async (auctionSlug: string) =>
    (
      await pool.query<{ id: string; status: string; amount_cents: number; provider_session_id: string }>(
        `SELECT purchase.id, purchase.status, purchase.amount_cents, purchase.provider_session_id
           FROM purchases purchase JOIN auctions auction ON auction.id = purchase.auction_id
          WHERE auction.slug = $1`,
        [auctionSlug],
      )
    ).rows[0]!;

  const earningsOf = async (handle: string) =>
    (await app.inject({ method: 'GET', url: '/api/me/earnings', headers: { 'x-demo-user-id': seedUserId(handle) } })).json();

  /** Runs the auction, starts checkout as the winner, and returns the session the buyer will pay. */
  async function sellAndCheckOut(sale: {
    sellerHandle: string;
    artworkSlug: string;
    winnerHandle: string;
    bids: readonly (readonly [string, number])[];
  }): Promise<{ auctionSlug: string; sessionId: string; purchaseId: string; amountCents: number }> {
    const auctionSlug = await runAuctionToClose(app, clock, sale);
    const response = await app.inject({
      method: 'POST',
      url: `/api/auctions/${auctionSlug}/checkout`,
      headers: { 'x-demo-user-id': seedUserId(sale.winnerHandle) },
    });
    if (response.statusCode !== 200) throw new Error(`checkout failed: ${response.body}`);
    const purchase = await purchaseOf(auctionSlug);
    return { auctionSlug, sessionId: purchase.provider_session_id, purchaseId: purchase.id, amountCents: purchase.amount_cents };
  }

  /** Rafael sells his own "Desert Geometry" to Ada for $310: a primary sale. */
  const sellDesertGeometryToAda = () =>
    sellAndCheckOut({
      sellerHandle: 'rafael_ortiz',
      artworkSlug: 'desert-geometry',
      winnerHandle: 'ada_mensah',
      bids: [
        ['ada_mensah', 500_00],
        ['bianca_rossi', 300_00],
      ],
    });

  it('settles a paid checkout: marks it paid, posts the ledger, transfers ownership, and records PurchasePaid', async () => {
    const sale = await sellDesertGeometryToAda();

    expect(await deliver(payments.completeSession(sale.sessionId))).toBe('settled');

    expect(await purchaseOf(sale.auctionSlug)).toMatchObject({ status: 'paid', amount_cents: 310_00 });
    expect(await ownerOf('desert-geometry')).toBe(seedUserId('ada_mensah'));
    expect(await count('ledger_transactions WHERE purchase_id = $1', [sale.purchaseId])).toBe(1);
    expect(await earningsOf('rafael_ortiz')).toMatchObject({ sellerProceedsCents: 279_00, artistRoyaltiesCents: 0 });
    const { rows: events } = await pool.query(`SELECT payload FROM outbox_events WHERE type = 'PurchasePaid'`);
    expect(events).toEqual([
      {
        payload: expect.objectContaining({
          purchaseId: sale.purchaseId,
          buyerUserId: seedUserId('ada_mensah'),
          sellerUserId: seedUserId('rafael_ortiz'),
          artistUserId: seedUserId('rafael_ortiz'),
          saleType: 'primary',
          amountCents: 310_00,
          platformFeeCents: 31_00,
          artistRoyaltyCents: 0,
          sellerProceedsCents: 279_00,
        }),
      },
    ]);
    const { rows: recorded } = await pool.query('SELECT outcome FROM payment_events');
    expect(recorded).toEqual([{ outcome: 'settled' }]);
  });

  it('treats a replayed event as a no-op', async () => {
    const sale = await sellDesertGeometryToAda();
    const webhook = payments.completeSession(sale.sessionId);

    expect(await deliver(webhook)).toBe('settled');
    expect(await deliver(webhook)).toBe('duplicate');

    expect(await count('payment_events')).toBe(1);
    expect(await count('ledger_transactions')).toBe(1);
    expect(await count(`outbox_events WHERE type = 'PurchasePaid'`)).toBe(1);
    expect(await earningsOf('rafael_ortiz')).toMatchObject({ sellerProceedsCents: 279_00 });
  });

  it('two identical webhooks delivered at once to two instances produce one ledger transaction', async () => {
    const sale = await sellDesertGeometryToAda();
    const webhook = payments.completeSession(sale.sessionId);
    await pool.query(CREATE_WIDENING_TRIGGER);

    const outcomes = await Promise.all([deliver(webhook, app), deliver(webhook, secondApp)]);

    expect(outcomes.sort()).toEqual(['duplicate', 'settled']);
    expect(await count('ledger_transactions')).toBe(1);
    expect(await count('ledger_entries')).toBe(3);
    expect(await count(`outbox_events WHERE type = 'PurchasePaid'`)).toBe(1);
    expect(await ownerOf('desert-geometry')).toBe(seedUserId('ada_mensah'));
  });

  it('a different event for an already paid purchase changes nothing', async () => {
    const sale = await sellDesertGeometryToAda();
    await deliver(payments.completeSession(sale.sessionId));

    const resent = payments.signEvent('checkout.session.completed', payments.sessionFields(sale.sessionId));
    expect(await deliver(resent)).toBe('already_paid');

    expect(await count('ledger_transactions')).toBe(1);
    expect(await count('payment_events')).toBe(2);
  });

  describe('records and ignores an event that does not match the purchase', () => {
    it.each`
      case                          | changes                                       | outcome
      ${'a different amount'}       | ${{ amount_total: 1_00 }}                     | ${'amount_mismatch'}
      ${'a different currency'}     | ${{ currency: 'eur' }}                        | ${'currency_mismatch'}
      ${'a different session'}      | ${{ id: 'cs_test_somebody_else' }}            | ${'session_mismatch'}
      ${'an unpaid session'}        | ${{ payment_status: 'unpaid' }}               | ${'not_paid'}
      ${'an unknown purchase'}      | ${{ metadata: { purchaseId: randomUUID() } }} | ${'unknown_purchase'}
      ${'a malformed purchase ID'}  | ${{ metadata: { purchaseId: 'not-a-uuid' } }} | ${'unknown_purchase'}
      ${'no purchase ID at all'}    | ${{ metadata: {}, client_reference_id: null }} | ${'unknown_purchase'}
    `('$case → $outcome', async ({ changes, outcome }) => {
      const sale = await sellDesertGeometryToAda();
      payments.completeSession(sale.sessionId);
      const forged = payments.signEvent('checkout.session.completed', { ...payments.sessionFields(sale.sessionId), ...changes });

      expect(await deliver(forged)).toBe(outcome);

      expect(await purchaseOf(sale.auctionSlug)).toMatchObject({ status: 'pending' });
      expect(await count('ledger_transactions')).toBe(0);
      expect(await ownerOf('desert-geometry')).toBe(seedUserId('rafael_ortiz'));
      const { rows } = await pool.query('SELECT outcome FROM payment_events');
      expect(rows).toEqual([{ outcome }]);
    });
  });

  it('records other event types and does nothing else', async () => {
    const webhook = payments.signEvent('payment_intent.created', { id: 'pi_test_1' });

    expect(await deliver(webhook)).toBe('ignored_event_type');
    const { rows } = await pool.query('SELECT event_type, outcome FROM payment_events');
    expect(rows).toEqual([{ event_type: 'payment_intent.created', outcome: 'ignored_event_type' }]);
  });

  it('rolls everything back, including the event record, if the seller no longer owns the artwork', async () => {
    const sale = await sellDesertGeometryToAda();
    await pool.query('UPDATE artworks SET owner_user_id = $1 WHERE slug = $2', [seedUserId('chidi_nwosu'), 'desert-geometry']);

    await expect(deliver(payments.completeSession(sale.sessionId))).rejects.toMatchObject({ code: ErrorCode.INVARIANT_VIOLATION });

    expect(await purchaseOf(sale.auctionSlug)).toMatchObject({ status: 'pending' });
    expect(await count('ledger_transactions')).toBe(0);
    // No record, so the provider's retry is processed once the problem is fixed.
    expect(await count('payment_events')).toBe(0);
  });

  it('a later resale by the buyer pays the original artist a royalty', async () => {
    const primary = await sellDesertGeometryToAda();
    await deliver(payments.completeSession(primary.sessionId));

    const resale = await sellAndCheckOut({
      sellerHandle: 'ada_mensah',
      artworkSlug: 'desert-geometry',
      winnerHandle: 'bianca_rossi',
      bids: [
        ['bianca_rossi', 900_00],
        ['chidi_nwosu', 600_00],
      ],
    });
    expect(await deliver(payments.completeSession(resale.sessionId))).toBe('settled');

    const platformFeeCents = Math.floor((resale.amountCents * 1_000) / 10_000);
    const royaltyCents = Math.floor((resale.amountCents * 500) / 10_000);
    expect(await ownerOf('desert-geometry')).toBe(seedUserId('bianca_rossi'));
    expect(await earningsOf('rafael_ortiz')).toMatchObject({ sellerProceedsCents: 279_00, artistRoyaltiesCents: royaltyCents });
    expect(await earningsOf('ada_mensah')).toMatchObject({
      sellerProceedsCents: resale.amountCents - platformFeeCents - royaltyCents,
      artistRoyaltiesCents: 0,
    });
    const { rows } = await pool.query(
      `SELECT payload->>'saleType' AS sale_type FROM outbox_events WHERE type = 'PurchasePaid' ORDER BY occurred_at, id`,
    );
    expect(rows.map((row) => row.sale_type).sort()).toEqual(['primary', 'resale']);
  });
});
