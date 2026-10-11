import { centsToDollarInput, parseDollarsToCents } from '../../shared/format/money';
import type { AssistantBidSuggestion, AssistantPageContext } from './assistant-api';

const PAGE_PATTERN = /^\/(auctions|artworks)\/([a-z0-9]+(?:-[a-z0-9]+)*)\/?$/;
export const MAXIMUM_BID_PARAMETER = 'maximumBid';

/** Only an auction or artwork detail page gives the Concierge a context; checkout pages and lists do not. */
export function assistantContextFromPath(pathname: string): AssistantPageContext | undefined {
  const match = PAGE_PATTERN.exec(pathname);
  if (!match?.[1] || !match[2]) return undefined;
  return { type: match[1] === 'auctions' ? 'auction' : 'artwork', slug: match[2] };
}

export function starterPrompts(context: AssistantPageContext | undefined): string[] {
  if (context?.type === 'auction') return ['What should I bid on this?', 'Is the reserve met?', 'Find similar works'];
  if (context?.type === 'artwork') return ['Tell me about this work', 'Is it at auction?', 'Find similar works'];
  return ['Paintings ending this week', 'Prints under $500', 'How are my bids doing?'];
}

/** One conversation per demo user per tab, so switching users never mixes chats. */
export function assistantSessionKey(demoUserId: string): string {
  return `art-auction.concierge-session.${demoUserId}`;
}

/** The suggestion only pre-fills the form; the user still reviews and submits it. */
export function bidPrefillHref(suggestion: Pick<AssistantBidSuggestion, 'auctionSlug' | 'amountCents'>): string {
  const params = new URLSearchParams({ [MAXIMUM_BID_PARAMETER]: centsToDollarInput(suggestion.amountCents) });
  return `/auctions/${encodeURIComponent(suggestion.auctionSlug)}?${params.toString()}`;
}

/** The pre-filled amount from the URL, or '' for anything that is not a plain dollar amount. */
export function suggestedMaximumBidFrom(search: string): string {
  const value = new URLSearchParams(search).get(MAXIMUM_BID_PARAMETER) ?? '';
  const cents = /^\d{1,9}(\.\d{1,2})?$/.test(value) ? parseDollarsToCents(value) : null;
  return cents !== null && cents > 0 ? value : '';
}
