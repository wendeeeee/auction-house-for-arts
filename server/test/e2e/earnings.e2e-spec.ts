import { randomUUID } from 'node:crypto';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { Pool } from 'pg';
import { Clock } from '../../src/common/clock';
import { UnitOfWork } from '../../src/database';
import { seedCatalog } from '../../src/database/seed/seed-catalog';
import { LedgerService, SaleToRecord } from '../../src/modules/ledger';
import { seedUserId } from '../support/auction-api';
import { createTestApp } from '../support/create-test-app';
import { FakeClock } from '../support/fake-clock';
import { createTestPool, prepareTestDatabase, truncateAllTables } from '../support/test-database';

const FIRST_SALE_AT = new Date('2026-01-15T14:00:00.000Z');
const SECOND_SALE_AT = new Date('2026-01-16T09:30:00.000Z');

/** Sales are recorded through LedgerService, as the payment webhook will do in a later step. */
describe('earnings API', () => {
  let app: NestFastifyApplication;
  let pool: Pool;
  const clock = new FakeClock(FIRST_SALE_AT);

  beforeAll(async () => {
    await prepareTestDatabase();
    pool = createTestPool();
    app = await createTestApp({ configure: (builder) => builder.overrideProvider(Clock).useValue(clock) });
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  beforeEach(async () => {
    await truncateAllTables(pool);
    await seedCatalog(pool);
    clock.setTo(FIRST_SALE_AT);
  });

  const getEarnings = (handle: string | null) =>
    app.inject({
      method: 'GET',
      url: '/api/me/earnings',
      headers: handle === null ? {} : { 'x-demo-user-id': seedUserId(handle) },
    });

  const recordSale = (sale: Omit<SaleToRecord, 'purchaseId'>) =>
    app.get(UnitOfWork).run(() => app.get(LedgerService).recordSale({ purchaseId: randomUUID(), ...sale }));

  it('shows zero for a user who has earned nothing', async () => {
    const response = await getEarnings('ada_mensah');

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ currency: 'usd', sellerProceedsCents: 0, artistRoyaltiesCents: 0, recentEntries: [] });
  });

  it('shows a collector’s proceeds and the artist’s royalty from a resale, each to its own user', async () => {
    // Bianca resells Amara Okafor's "Lagos at Dusk" (royalty 5%) for $1,234.57; the fee is 10%.
    await recordSale({
      memo: 'Sale of “Lagos at Dusk”',
      hammerPriceCents: 1_234_57,
      sellerUserId: seedUserId('bianca_rossi'),
      artistUserId: seedUserId('amara_okafor'),
      artistRoyaltyBps: 500,
    });

    expect((await getEarnings('bianca_rossi')).json()).toEqual({
      currency: 'usd',
      sellerProceedsCents: 1_049_40,
      artistRoyaltiesCents: 0,
      recentEntries: [
        {
          purchaseId: expect.any(String),
          accountKind: 'seller_payable',
          earnedCents: 1_049_40,
          memo: 'Sale of “Lagos at Dusk”',
          postedAt: FIRST_SALE_AT.toISOString(),
        },
      ],
    });
    expect((await getEarnings('amara_okafor')).json()).toMatchObject({
      sellerProceedsCents: 0,
      artistRoyaltiesCents: 61_72,
      recentEntries: [{ accountKind: 'artist_payable', earnedCents: 61_72 }],
    });
    // The buyer and bystanders earn nothing.
    expect((await getEarnings('ada_mensah')).json()).toMatchObject({ sellerProceedsCents: 0, artistRoyaltiesCents: 0 });
  });

  it('adds up an artist’s primary-sale proceeds and royalties, newest entry first', async () => {
    await recordSale({
      memo: 'Sale of “Harmattan Light”',
      hammerPriceCents: 2_000_00,
      sellerUserId: seedUserId('amara_okafor'),
      artistUserId: seedUserId('amara_okafor'),
      artistRoyaltyBps: 500,
    });
    clock.setTo(SECOND_SALE_AT);
    await recordSale({
      memo: 'Sale of “Lagos at Dusk”',
      hammerPriceCents: 1_000_00,
      sellerUserId: seedUserId('bianca_rossi'),
      artistUserId: seedUserId('amara_okafor'),
      artistRoyaltyBps: 500,
    });

    const earnings = (await getEarnings('amara_okafor')).json();
    expect(earnings).toMatchObject({ sellerProceedsCents: 1_800_00, artistRoyaltiesCents: 50_00 });
    expect(earnings.recentEntries.map((entry: { memo: string; accountKind: string }) => [entry.memo, entry.accountKind])).toEqual([
      ['Sale of “Lagos at Dusk”', 'artist_payable'],
      ['Sale of “Harmattan Light”', 'seller_payable'],
    ]);
  });

  it('requires a user', async () => {
    const response = await getEarnings(null);
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('UNAUTHENTICATED');
  });
});
