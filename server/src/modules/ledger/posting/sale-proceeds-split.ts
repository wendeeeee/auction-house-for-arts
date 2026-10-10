import { InvalidAmountError } from '../../../common/errors';
import { BASIS_POINTS_PER_WHOLE, RoundingMode, assertBasisPoints, computeBasisPointShareCents } from '../../../common/money';
import type { SaleType } from '../../artworks';
import { InvalidLedgerPostingError } from '../ledger.errors';
import { PostingLine, SaleProceedsSplit } from '../ledger.types';

export interface SaleProceedsSplitInput {
  readonly hammerPriceCents: number;
  readonly platformFeeBps: number;
  readonly artistRoyaltyBps: number;
  readonly saleType: SaleType;
}

/**
 * Splits a hammer price H into the platform fee, the artist's resale royalty, and the seller's
 * proceeds.
 *
 * Rounding rule (the only one in the money path): the fee and the royalty are each rounded
 * DOWN to a whole cent, and the seller receives the remainder, `H − fee − royalty`. So the
 * three parts always sum to exactly H: no cent is created or lost, and any fraction of a cent
 * favours the seller, never the platform.
 *
 * A primary sale (the artist sells their own work) pays no royalty: the artist is paid as the
 * seller.
 */
export function computeSaleProceedsSplit(input: SaleProceedsSplitInput): SaleProceedsSplit {
  const { hammerPriceCents, platformFeeBps, artistRoyaltyBps, saleType } = input;
  if (!Number.isSafeInteger(hammerPriceCents) || hammerPriceCents <= 0) {
    throw new InvalidAmountError('The hammer price must be a positive whole number of cents.', {
      hammerPriceCents: String(hammerPriceCents),
    });
  }
  assertBasisPoints(platformFeeBps, 'platformFeeBps');
  assertBasisPoints(artistRoyaltyBps, 'artistRoyaltyBps');
  const royaltyBps = saleType === 'resale' ? artistRoyaltyBps : 0;
  if (platformFeeBps + royaltyBps > BASIS_POINTS_PER_WHOLE) {
    throw new InvalidLedgerPostingError('The platform fee and the royalty together exceed the sale price.', {
      platformFeeBps,
      artistRoyaltyBps: royaltyBps,
    });
  }

  const platformFeeCents = computeBasisPointShareCents(hammerPriceCents, platformFeeBps, RoundingMode.DOWN);
  const artistRoyaltyCents = computeBasisPointShareCents(hammerPriceCents, royaltyBps, RoundingMode.DOWN);
  return {
    platformFeeCents,
    artistRoyaltyCents,
    sellerProceedsCents: hammerPriceCents - platformFeeCents - artistRoyaltyCents,
  };
}

export interface SalePostingParties {
  readonly hammerPriceCents: number;
  readonly sellerUserId: string;
  readonly artistUserId: string;
}

/**
 * The double-entry lines for a paid sale. The buyer's money arrives as cash (debit), and is
 * owed onward as platform revenue, the artist's royalty, and the seller's proceeds (credits).
 * Zero amounts (a 0% royalty, a primary sale) are left out: a line that moves nothing is noise.
 */
export function computeSalePostingLines(split: SaleProceedsSplit, parties: SalePostingParties): PostingLine[] {
  const lines: PostingLine[] = [
    { account: { kind: 'platform_cash', ownerUserId: null }, amountCents: parties.hammerPriceCents },
    { account: { kind: 'platform_revenue', ownerUserId: null }, amountCents: -split.platformFeeCents },
    { account: { kind: 'artist_payable', ownerUserId: parties.artistUserId }, amountCents: -split.artistRoyaltyCents },
    { account: { kind: 'seller_payable', ownerUserId: parties.sellerUserId }, amountCents: -split.sellerProceedsCents },
  ];
  return lines.filter((line) => line.amountCents !== 0);
}
