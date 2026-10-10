import { ErrorCode } from '../../../common/errors';
import type { SaleType } from '../../artworks';
import { assertPostingBalances } from './posting-validation';
import { SaleProceedsSplitInput, computeSalePostingLines, computeSaleProceedsSplit } from './sale-proceeds-split';

const ARTIST = 'artist-user-id';
const COLLECTOR = 'collector-user-id';
const TEN_PERCENT_FEE_BPS = 1_000;

function split(hammerPriceCents: number, saleType: SaleType, artistRoyaltyBps = 500): ReturnType<typeof computeSaleProceedsSplit> {
  return computeSaleProceedsSplit({ hammerPriceCents, platformFeeBps: TEN_PERCENT_FEE_BPS, artistRoyaltyBps, saleType });
}

describe('computeSaleProceedsSplit', () => {
  it.each`
    case                                  | hammerPriceCents | saleType     | artistRoyaltyBps | platformFeeCents | artistRoyaltyCents | sellerProceedsCents
    ${'primary sale: no royalty'}         | ${1_000_00}      | ${'primary'} | ${500}           | ${100_00}        | ${0}               | ${900_00}
    ${'resale with a 5% royalty'}         | ${1_000_00}      | ${'resale'}  | ${500}           | ${100_00}        | ${50_00}           | ${850_00}
    ${'resale with a 0% royalty'}         | ${1_000_00}      | ${'resale'}  | ${0}             | ${100_00}        | ${0}               | ${900_00}
    ${'odd cents: $1,234.57 at 5%'}       | ${1_234_57}      | ${'resale'}  | ${500}           | ${123_45}        | ${61_72}           | ${1_049_40}
    ${'odd cents: $1,234.57 at 7.5%'}     | ${1_234_57}      | ${'resale'}  | ${750}           | ${123_45}        | ${92_59}           | ${1_018_53}
    ${'odd cents: $1,234.57 primary'}     | ${1_234_57}      | ${'primary'} | ${750}           | ${123_45}        | ${0}               | ${1_111_12}
    ${'one cent: both shares round to 0'} | ${1}             | ${'resale'}  | ${2_000}         | ${0}             | ${0}               | ${1}
  `(
    '$case',
    ({ hammerPriceCents, saleType, artistRoyaltyBps, platformFeeCents, artistRoyaltyCents, sellerProceedsCents }) => {
      const result = split(hammerPriceCents, saleType, artistRoyaltyBps);

      expect(result).toEqual({ platformFeeCents, artistRoyaltyCents, sellerProceedsCents });
      // The parts are exactly the hammer price: nothing created, nothing lost.
      expect(result.platformFeeCents + result.artistRoyaltyCents + result.sellerProceedsCents).toBe(hammerPriceCents);

      // And the ledger lines built from it balance, with the cash debit equal to the hammer price.
      const lines = computeSalePostingLines(result, {
        hammerPriceCents,
        sellerUserId: saleType === 'primary' ? ARTIST : COLLECTOR,
        artistUserId: ARTIST,
      });
      expect(() => assertPostingBalances(lines)).not.toThrow();
      expect(lines.reduce((sum, line) => sum + line.amountCents, 0)).toBe(0);
      expect(lines.find((line) => line.account.kind === 'platform_cash')?.amountCents).toBe(hammerPriceCents);
    },
  );

  it('rounds each share down and gives the leftover fraction to the seller', () => {
    // 10% of $0.19 is 1.9 cents and 5% is 0.95 cents: the platform takes 1, the artist 0, the seller 18.
    expect(split(19, 'resale')).toEqual({ platformFeeCents: 1, artistRoyaltyCents: 0, sellerProceedsCents: 18 });
  });

  it('never overflows on a large price, because the share is computed in BigInt', () => {
    const hammerPriceCents = Number.MAX_SAFE_INTEGER;
    const result = split(hammerPriceCents, 'resale', 2_000);
    expect(result.platformFeeCents + result.artistRoyaltyCents + result.sellerProceedsCents).toBe(hammerPriceCents);
  });

  it.each([0, -100, 12.5, Number.NaN])('rejects a hammer price of %p', (hammerPriceCents) => {
    expect(() => split(hammerPriceCents, 'resale')).toThrow(expect.objectContaining({ code: ErrorCode.INVALID_AMOUNT }));
  });

  it('rejects a fee and royalty that together exceed the whole price', () => {
    const input: SaleProceedsSplitInput = {
      hammerPriceCents: 100_00,
      platformFeeBps: 9_000,
      artistRoyaltyBps: 2_000,
      saleType: 'resale',
    };
    expect(() => computeSaleProceedsSplit(input)).toThrow(expect.objectContaining({ code: ErrorCode.INVALID_LEDGER_POSTING }));
    // The same rates are fine on a primary sale, which pays no royalty.
    expect(computeSaleProceedsSplit({ ...input, saleType: 'primary' }).sellerProceedsCents).toBe(10_00);
  });
});

describe('computeSalePostingLines', () => {
  it('a resale: cash in, then revenue, royalty, and proceeds owed out', () => {
    const result = split(1_000_00, 'resale');
    expect(computeSalePostingLines(result, { hammerPriceCents: 1_000_00, sellerUserId: COLLECTOR, artistUserId: ARTIST })).toEqual([
      { account: { kind: 'platform_cash', ownerUserId: null }, amountCents: 1_000_00 },
      { account: { kind: 'platform_revenue', ownerUserId: null }, amountCents: -100_00 },
      { account: { kind: 'artist_payable', ownerUserId: ARTIST }, amountCents: -50_00 },
      { account: { kind: 'seller_payable', ownerUserId: COLLECTOR }, amountCents: -850_00 },
    ]);
  });

  it('a primary sale: no royalty line, and the artist is paid as the seller', () => {
    const result = split(1_000_00, 'primary');
    expect(computeSalePostingLines(result, { hammerPriceCents: 1_000_00, sellerUserId: ARTIST, artistUserId: ARTIST })).toEqual([
      { account: { kind: 'platform_cash', ownerUserId: null }, amountCents: 1_000_00 },
      { account: { kind: 'platform_revenue', ownerUserId: null }, amountCents: -100_00 },
      { account: { kind: 'seller_payable', ownerUserId: ARTIST }, amountCents: -900_00 },
    ]);
  });
});
