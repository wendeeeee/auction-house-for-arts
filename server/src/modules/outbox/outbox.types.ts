import { z } from 'zod';

// Producers and consumers share these schemas. Add optional fields only; a breaking change is a new type.

export const AUCTION_OUTCOMES = ['sold', 'reserve_not_met', 'no_bids'] as const;
export type AuctionOutcome = (typeof AUCTION_OUTCOMES)[number];

// The refinements mirror auction_closes' CHECK constraints.
export const auctionClosedPayloadSchema = z
  .object({
    auctionId: z.uuid(),
    auctionSlug: z.string().min(1),
    artworkTitle: z.string().min(1),
    sellerUserId: z.uuid(),
    outcome: z.enum(AUCTION_OUTCOMES),
    winningUserId: z.uuid().nullable(),
    leadingBidderUserId: z.uuid().nullable(),
    hammerPriceCents: z.number().int().positive().nullable(),
    closedAt: z.iso.datetime(),
  })
  .refine((event) => (event.outcome === 'sold') === (event.winningUserId !== null), {
    message: 'winningUserId is set exactly when the auction sold',
    path: ['winningUserId'],
  })
  .refine((event) => (event.winningUserId === null) === (event.hammerPriceCents === null), {
    message: 'hammerPriceCents is set exactly when there is a winner',
    path: ['hammerPriceCents'],
  })
  .refine((event) => (event.outcome === 'no_bids') === (event.leadingBidderUserId === null), {
    message: 'leadingBidderUserId is set exactly when anyone bid',
    path: ['leadingBidderUserId'],
  });
export type AuctionClosedPayload = z.infer<typeof auctionClosedPayloadSchema>;

export const purchasePaidPayloadSchema = z
  .object({
    purchaseId: z.uuid(),
    auctionId: z.uuid(),
    auctionSlug: z.string().min(1),
    artworkTitle: z.string().min(1),
    buyerUserId: z.uuid(),
    sellerUserId: z.uuid(),
    artistUserId: z.uuid(),
    saleType: z.enum(['primary', 'resale']),
    amountCents: z.number().int().positive(),
    platformFeeCents: z.number().int().nonnegative(),
    artistRoyaltyCents: z.number().int().nonnegative(),
    sellerProceedsCents: z.number().int().nonnegative(),
    paidAt: z.iso.datetime(),
  })
  .refine((event) => event.platformFeeCents + event.artistRoyaltyCents + event.sellerProceedsCents === event.amountCents, {
    message: 'the split must add up to the amount paid',
    path: ['sellerProceedsCents'],
  });
export type PurchasePaidPayload = z.infer<typeof purchasePaidPayloadSchema>;

export interface OutboxEventPayloads {
  readonly AuctionClosed: AuctionClosedPayload;
  readonly PurchasePaid: PurchasePaidPayload;
}
export type OutboxEventType = keyof OutboxEventPayloads;

export const OUTBOX_EVENT_PAYLOAD_SCHEMAS: { readonly [Type in OutboxEventType]: z.ZodType<OutboxEventPayloads[Type]> } = {
  AuctionClosed: auctionClosedPayloadSchema,
  PurchasePaid: purchasePaidPayloadSchema,
};

export const OUTBOX_EVENT_ROUTING_KEYS: { readonly [Type in OutboxEventType]: string } = {
  AuctionClosed: 'auction.closed',
  PurchasePaid: 'purchase.paid',
};

export const isOutboxEventType = (type: string): type is OutboxEventType => Object.hasOwn(OUTBOX_EVENT_ROUTING_KEYS, type);

export interface OutboxEvent {
  readonly id: string;
  readonly type: string;
  readonly payload: unknown;
  readonly occurredAt: Date;
  readonly publishedAt: Date | null;
  readonly publishAttemptCount: number;
}
