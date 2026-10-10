import { z } from 'zod';
import { Earnings, USER_PAYABLE_ACCOUNT_KINDS } from './ledger.types';

export const earningsViewSchema = z.object({
  currency: z.literal('usd'),
  sellerProceedsCents: z.number().int().describe('Owed to you as the seller of works that have been paid for.'),
  artistRoyaltiesCents: z.number().int().describe('Owed to you as the artist when your works are resold.'),
  recentEntries: z
    .array(
      z.object({
        purchaseId: z.uuid(),
        accountKind: z.enum(USER_PAYABLE_ACCOUNT_KINDS).describe('seller_payable: sale proceeds; artist_payable: a resale royalty.'),
        earnedCents: z.number().int(),
        memo: z.string(),
        postedAt: z.iso.datetime(),
      }),
    )
    .describe('Newest first.'),
});
export type EarningsView = z.infer<typeof earningsViewSchema>;

export function toEarningsView(earnings: Earnings): EarningsView {
  return {
    currency: 'usd',
    sellerProceedsCents: earnings.sellerProceedsCents,
    artistRoyaltiesCents: earnings.artistRoyaltiesCents,
    recentEntries: earnings.recentEntries.map((entry) => ({
      purchaseId: entry.purchaseId,
      accountKind: entry.accountKind,
      earnedCents: entry.earnedCents,
      memo: entry.memo,
      postedAt: entry.postedAt.toISOString(),
    })),
  };
}
