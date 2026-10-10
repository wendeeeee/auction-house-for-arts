import { InvalidAmountError } from '../../common/errors';
import { parseDollarsToCents } from '../../common/money';

export interface ParsedAssistantReply {
  /** The visible text, tags removed. */
  readonly text: string;
  readonly recommendedAuctionSlugs: readonly string[];
  /** The model's suggestion, not yet checked against anything. */
  readonly bidSuggestion: { readonly auctionSlug: string; readonly amountCents: number } | null;
  readonly followUpSuggestions: readonly string[];
}

const AUCTIONS_TAG = /\[\[AUCTIONS:([^\]]*)\]\]/;
const BID_TAG = /\[\[BID:([a-z0-9-]+):([$\d,.]+)\]\]/;
const SUGGESTIONS_TAG = /\[\[SUGGESTIONS:([^\]]*)\]\]/;
const ANY_TAG = /\[\[[A-Z]+:[^\]]*\]\]/g;
const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const MAXIMUM_FOLLOW_UP_SUGGESTIONS = 3;
const MAXIMUM_FOLLOW_UP_LENGTH = 60;

/** Reads the response tags the prompt asks for and strips every tag from the visible text. */
export function parseAssistantReply(raw: string): ParsedAssistantReply {
  const recommendedAuctionSlugs = (AUCTIONS_TAG.exec(raw)?.[1] ?? '')
    .split(',')
    .map((slug) => slug.trim())
    .filter((slug) => SLUG.test(slug));
  const followUpSuggestions = (SUGGESTIONS_TAG.exec(raw)?.[1] ?? '')
    .split('|')
    .map((suggestion) => suggestion.trim())
    .filter((suggestion) => suggestion.length > 0 && suggestion.length <= MAXIMUM_FOLLOW_UP_LENGTH)
    .slice(0, MAXIMUM_FOLLOW_UP_SUGGESTIONS);

  return {
    text: raw.replace(ANY_TAG, '').replace(/\n{3,}/g, '\n\n').trim(),
    recommendedAuctionSlugs: [...new Set(recommendedAuctionSlugs)],
    bidSuggestion: parseBidTag(raw),
    followUpSuggestions,
  };
}

function parseBidTag(raw: string): ParsedAssistantReply['bidSuggestion'] {
  const match = BID_TAG.exec(raw);
  if (!match?.[1] || !match[2]) return null;
  try {
    return { auctionSlug: match[1], amountCents: parseDollarsToCents(match[2]) };
  } catch (error) {
    if (error instanceof InvalidAmountError) return null;
    throw error;
  }
}
