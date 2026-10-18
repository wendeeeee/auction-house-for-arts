import { z } from 'zod';


const AUCTION_SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export const watchAuctionMessageSchema = z.object({
  slug: z.string().max(140).regex(AUCTION_SLUG_PATTERN, { error: 'must be an auction slug' }),
});

export type WatchAuctionMessage = z.infer<typeof watchAuctionMessageSchema>;
