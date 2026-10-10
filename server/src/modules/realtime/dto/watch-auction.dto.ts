import { z } from 'zod';

/**
 * Mirrors the `auctions_slug_format` CHECK in 002_auctions.sql. The pattern has no `:`, so the
 * room a client can name is always `auction:<slug>` and can never spell another room
 * (`user:…`). It also caps the room name's length.
 */
const AUCTION_SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export const watchAuctionMessageSchema = z.object({
  slug: z.string().max(140).regex(AUCTION_SLUG_PATTERN, { error: 'must be an auction slug' }),
});

export type WatchAuctionMessage = z.infer<typeof watchAuctionMessageSchema>;
