import { ApiError } from '../../shared/api/api-error';
import { formatCents, parseDollarsToCents } from '../../shared/format/money';
import type { CreateAuctionRequest } from './auctions-api';

export const AUCTION_DURATIONS = [
  { label: '3 minutes (to try the soft close)', seconds: 3 * 60 },
  { label: '1 hour', seconds: 60 * 60 },
  { label: '1 day', seconds: 24 * 60 * 60 },
  { label: '3 days', seconds: 3 * 24 * 60 * 60 },
  { label: '7 days', seconds: 7 * 24 * 60 * 60 },
] as const;

const MINIMUM_PRICE_CENTS = 100;

export interface CreateAuctionFormInput {
  readonly artworkSlug: string;
  readonly startingPriceText: string;
  /** Blank for no reserve. */
  readonly reservePriceText: string;
  readonly durationSeconds: number;
  readonly now: Date;
}

export type CreateAuctionDraftResult =
  | { readonly isValid: true; readonly request: CreateAuctionRequest }
  | { readonly isValid: false; readonly problem: string };

/**
 * Turns the form into a request, catching typing mistakes early. The server still checks every
 * rule (it owns them); this only saves a round trip for an obviously wrong amount.
 */
export function buildCreateAuctionRequest(input: CreateAuctionFormInput): CreateAuctionDraftResult {
  const startingPriceCents = parseDollarsToCents(input.startingPriceText);
  if (startingPriceCents === null) return { isValid: false, problem: 'Enter a starting price in dollars, like 250.' };
  if (startingPriceCents < MINIMUM_PRICE_CENTS) {
    return { isValid: false, problem: `The starting price must be at least ${formatCents(MINIMUM_PRICE_CENTS)}.` };
  }

  let reservePriceCents: number | undefined;
  if (input.reservePriceText.trim() !== '') {
    const parsed = parseDollarsToCents(input.reservePriceText);
    if (parsed === null) return { isValid: false, problem: 'Enter the reserve in dollars, or leave it blank.' };
    if (parsed < startingPriceCents) {
      return { isValid: false, problem: 'The reserve must be at least the starting price.' };
    }
    reservePriceCents = parsed;
  }

  return {
    isValid: true,
    request: {
      artworkSlug: input.artworkSlug,
      startingPriceCents,
      ...(reservePriceCents === undefined ? {} : { reservePriceCents }),
      endsAt: new Date(input.now.getTime() + input.durationSeconds * 1_000).toISOString(),
    },
  };
}

/** A rejected create, in words. */
export function describeCreateAuctionError(error: unknown): string {
  if (!(error instanceof ApiError)) return 'The auction could not be created. Please try again.';
  switch (error.code) {
    case 'ARTWORK_ALREADY_AT_AUCTION':
      return 'This work already has an auction that has not closed.';
    case 'NOT_ARTWORK_OWNER':
      return 'Only the current owner can put this work up for auction.';
    case 'VALIDATION_FAILED': {
      const fieldErrors = Array.isArray(error.details.fieldErrors) ? error.details.fieldErrors : [];
      const messages = fieldErrors
        .filter((fieldError): fieldError is { path: string; message: string } =>
          typeof fieldError?.path === 'string' && typeof fieldError?.message === 'string',
        )
        .map((fieldError) => `${fieldError.path} ${fieldError.message}`);
      return messages.length > 0 ? `Please check: ${messages.join('; ')}.` : error.message;
    }
    default:
      return error.message;
  }
}
