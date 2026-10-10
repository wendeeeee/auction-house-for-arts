import { z } from 'zod';
import { auctionSummaryViewSchema } from '../auctions';
import { ASSISTANT_PAGE_TYPES, AssistantSession, TranscriptEntry } from './assistant.types';

export const assistantStatusViewSchema = z.object({
  available: z.boolean(),
  model: z.string().nullable(),
});
export type AssistantStatusView = z.infer<typeof assistantStatusViewSchema>;

const bidSuggestionViewSchema = z.object({
  auctionSlug: z.string(),
  artworkTitle: z.string(),
  amountCents: z.number().int().describe('A suggested maximum. It only pre-fills the bid form; it never places a bid.'),
  minimumNextBidCents: z.number().int(),
});

export const assistantReplyViewSchema = z.object({
  sessionId: z.uuid(),
  message: z.string(),
  cards: z.array(auctionSummaryViewSchema).describe('Only auctions a tool returned in this conversation, read live.'),
  bidSuggestion: bidSuggestionViewSchema.nullable().describe('Shown only when valid for you right now.'),
  followUpSuggestions: z.array(z.string()),
});
export type AssistantReplyView = z.infer<typeof assistantReplyViewSchema>;

const transcriptEntryViewSchema = z.object({
  role: z.enum(['user', 'assistant']),
  text: z.string(),
  cards: z.array(auctionSummaryViewSchema),
  bidSuggestion: bidSuggestionViewSchema.nullable(),
  followUpSuggestions: z.array(z.string()),
  createdAt: z.iso.datetime(),
});

export const assistantTranscriptViewSchema = z.object({
  sessionId: z.uuid(),
  context: z.object({ type: z.enum(ASSISTANT_PAGE_TYPES), slug: z.string() }).nullable(),
  entries: z.array(transcriptEntryViewSchema),
});
export type AssistantTranscriptView = z.infer<typeof assistantTranscriptViewSchema>;

export function toAssistantReplyView(sessionId: string, reply: TranscriptEntry): AssistantReplyView {
  return {
    sessionId,
    message: reply.text,
    cards: [...(reply.cards ?? [])],
    bidSuggestion: reply.bidSuggestion ?? null,
    followUpSuggestions: [...(reply.followUpSuggestions ?? [])],
  };
}

/** The transcript only: the model's messages and raw tool output never leave the server. */
export function toAssistantTranscriptView(session: AssistantSession): AssistantTranscriptView {
  return {
    sessionId: session.id,
    context: session.context,
    entries: session.transcript.map((entry) => ({
      role: entry.role,
      text: entry.text,
      cards: [...(entry.cards ?? [])],
      bidSuggestion: entry.bidSuggestion ?? null,
      followUpSuggestions: [...(entry.followUpSuggestions ?? [])],
      createdAt: entry.createdAt,
    })),
  };
}
