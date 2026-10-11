import { isApiErrorWithCode } from '../../shared/api/api-error';
import { apiClient } from '../../shared/api/api-client';
import type { AuctionSummaryView } from '../../shared/api/api-types';

export interface AssistantPageContext {
  readonly type: 'auction' | 'artwork';
  readonly slug: string;
}

/** A suggested maximum, checked by the server against live data. It pre-fills the bid form; it never bids. */
export interface AssistantBidSuggestion {
  readonly auctionSlug: string;
  readonly artworkTitle: string;
  readonly amountCents: number;
  readonly minimumNextBidCents: number;
}

export interface AssistantReply {
  readonly sessionId: string;
  readonly message: string;
  readonly cards: readonly AuctionSummaryView[];
  readonly bidSuggestion: AssistantBidSuggestion | null;
  readonly followUpSuggestions: readonly string[];
}

export interface AssistantEntry {
  readonly role: 'user' | 'assistant';
  readonly text: string;
  readonly cards: readonly AuctionSummaryView[];
  readonly bidSuggestion: AssistantBidSuggestion | null;
  readonly followUpSuggestions: readonly string[];
  readonly createdAt: string;
}

export interface AssistantStatus {
  readonly available: boolean;
  readonly model: string | null;
}

export function getAssistantStatus(): Promise<AssistantStatus> {
  return apiClient.get('/assistant/status');
}

/** The user comes from the demo identity header, never from the body. */
export function sendAssistantMessage(request: {
  readonly sessionId?: string;
  readonly message: string;
  readonly context?: AssistantPageContext;
}): Promise<AssistantReply> {
  return apiClient.post('/assistant/chat', request);
}

/** Null when the conversation is gone or belongs to someone else: the panel starts fresh. */
export async function getAssistantSession(sessionId: string): Promise<readonly AssistantEntry[] | null> {
  try {
    const transcript = await apiClient.get<{ entries: readonly AssistantEntry[] }>(`/assistant/sessions/${encodeURIComponent(sessionId)}`);
    return transcript.entries;
  } catch (error) {
    if (isApiErrorWithCode(error, 'ASSISTANT_SESSION_NOT_FOUND')) return null;
    throw error;
  }
}

export function deleteAssistantSession(sessionId: string): Promise<void> {
  return apiClient.delete(`/assistant/sessions/${encodeURIComponent(sessionId)}`);
}
