import type { PurchasePaidPayload } from '../outbox';
import { decidePurchasePaidRecipients } from './purchase-paid-recipients';

const SELLER = 'seller-id';
const ARTIST = 'artist-id';

function paid(overrides: Partial<PurchasePaidPayload>): PurchasePaidPayload {
  return {
    purchaseId: 'purchase-id',
    auctionId: 'auction-id',
    auctionSlug: 'harbour-lot-1',
    artworkTitle: 'Harbour',
    buyerUserId: 'buyer-id',
    sellerUserId: SELLER,
    artistUserId: ARTIST,
    saleType: 'resale',
    amountCents: 1_000_00,
    platformFeeCents: 100_00,
    artistRoyaltyCents: 50_00,
    sellerProceedsCents: 850_00,
    paidAt: '2026-01-15T14:00:00.000Z',
    ...overrides,
  };
}

describe('decidePurchasePaidRecipients', () => {
  it('resale: the seller hears about their proceeds and the artist about their royalty', () => {
    expect(decidePurchasePaidRecipients(paid({}))).toEqual([
      { recipientUserId: SELLER, kind: 'seller_purchase_paid', earnedCents: 850_00 },
      { recipientUserId: ARTIST, kind: 'artist_royalty_earned', earnedCents: 50_00 },
    ]);
  });

  it('primary sale: the artist is the seller and hears once', () => {
    expect(
      decidePurchasePaidRecipients(
        paid({ saleType: 'primary', sellerUserId: ARTIST, artistRoyaltyCents: 0, sellerProceedsCents: 900_00 }),
      ),
    ).toEqual([{ recipientUserId: ARTIST, kind: 'seller_purchase_paid', earnedCents: 900_00 }]);
  });

  it('a resale with a 0% royalty does not tell the artist they earned nothing', () => {
    expect(decidePurchasePaidRecipients(paid({ artistRoyaltyCents: 0, sellerProceedsCents: 900_00 }))).toEqual([
      { recipientUserId: SELLER, kind: 'seller_purchase_paid', earnedCents: 900_00 },
    ]);
  });
});
