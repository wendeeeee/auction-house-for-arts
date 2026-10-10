import { z } from 'zod';

const ARTWORK_SLUG_PATTERN = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** $1 to $100M: whole cents, far inside the safe-integer range, so price arithmetic stays exact. */
export const MINIMUM_PRICE_CENTS = 100;
export const MAXIMUM_PRICE_CENTS = 10_000_000_000;

const priceCentsSchema = z.number().int().min(MINIMUM_PRICE_CENTS).max(MAXIMUM_PRICE_CENTS);

/**
 * The shape only. The time window for `endsAt` (2 minutes to 14 days away) is checked by the
 * service against the injected clock, because zod has no access to it.
 */
export const createAuctionBodySchema = z
  .object({
    artworkSlug: z.string().max(120).regex(ARTWORK_SLUG_PATTERN, { error: 'must be an artwork slug' }),
    startingPriceCents: priceCentsSchema,
    reservePriceCents: priceCentsSchema.optional().describe('Hidden from everyone, including in every response.'),
    endsAt: z.iso
      .datetime({ offset: true })
      .transform((text) => new Date(text))
      .describe('ISO 8601 instant, 2 minutes to 14 days from now.'),
  })
  .refine((body) => body.reservePriceCents === undefined || body.reservePriceCents >= body.startingPriceCents, {
    path: ['reservePriceCents'],
    error: 'must be at least the starting price',
  });

export type CreateAuctionBody = z.infer<typeof createAuctionBodySchema>;
