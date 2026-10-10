import { z } from 'zod';
import { MAXIMUM_PRICE_CENTS } from './create-auction.dto';

/** The minimum is a business rule (BID_TOO_LOW with the minimum in `details`), so only the shape is checked here. */
export const placeMaximumBidBodySchema = z.object({
  maxBidCents: z
    .number()
    .int()
    .positive()
    .max(MAXIMUM_PRICE_CENTS)
    .describe('The most you are willing to pay, in cents. The system bids for you only as much as needed to lead.'),
});

export type PlaceMaximumBidBody = z.infer<typeof placeMaximumBidBodySchema>;
