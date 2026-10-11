import type { AuctionSummaryView } from '../auctions';
import type { LlmMessage } from '../language-models';

export const ASSISTANT_PAGE_TYPES = ['auction', 'artwork'] as const;

/** The page the panel was opened from. It can change between turns of one conversation. */
export interface AssistantPageContext {
  readonly type: (typeof ASSISTANT_PAGE_TYPES)[number];
  readonly slug: string;
}

/** Shown only after the server re-checked it against live data; it pre-fills the maximum-bid form and never bids. */
export interface AssistantBidSuggestion {
  readonly auctionSlug: string;
  readonly artworkTitle: string;
  readonly amountCents: number;
  readonly minimumNextBidCents: number;
}

export interface TranscriptEntry {
  readonly role: 'user' | 'assistant';
  readonly text: string;
  readonly cards?: readonly AuctionSummaryView[];
  readonly bidSuggestion?: AssistantBidSuggestion | null;
  readonly followUpSuggestions?: readonly string[];
  readonly createdAt: string;
}

export interface AssistantSession {
  readonly id: string;
  readonly userId: string;
  readonly context: AssistantPageContext | null;
  /** What the model sees: system prompt, turns, tool calls, and tool results. */
  readonly messages: readonly LlmMessage[];
  /** What the user sees; never raw tool output. */
  readonly transcript: readonly TranscriptEntry[];
  /** Every auction slug a tool returned in this session. Anything else the model names is dropped. */
  readonly knownAuctionSlugs: readonly string[];
  readonly createdAt: string;
  readonly updatedAt: string;
}
