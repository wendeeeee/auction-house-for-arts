import { z } from 'zod';
import { AUCTION_OUTCOMES } from './closing.types';
import type { AuctionOutcomeDetails } from './auction-close.service';

export const auctionOutcomeViewSchema = z.discriminatedUnion('isClosed', [
  z.object({
    isClosed: z.literal(false).describe('Not closed yet: still open, or ended moments ago and the result is being recorded.'),
  }),
  z.object({
    isClosed: z.literal(true),
    outcome: z.enum(AUCTION_OUTCOMES),
    hammerPriceCents: z.number().int().nullable().describe('The sale price; set only when sold.'),
    winnerHandle: z.string().nullable().describe('Set only when sold.'),
    closedAt: z.iso.datetime(),
    youWon: z.boolean().describe('True only for the winner; checkout follows in phase 5.'),
  }),
]);
export type AuctionOutcomeView = z.infer<typeof auctionOutcomeViewSchema>;

export function toAuctionOutcomeView(details: AuctionOutcomeDetails): AuctionOutcomeView {
  const { close, winnerHandle, viewerUserId } = details;
  if (close === null) return { isClosed: false };
  return {
    isClosed: true,
    outcome: close.outcome,
    hammerPriceCents: close.hammerPriceCents,
    winnerHandle,
    closedAt: close.closedAt.toISOString(),
    youWon: viewerUserId !== null && viewerUserId === close.winningUserId,
  };
}
