import type { AssistantSession } from './assistant.types';

export const MAXIMUM_MODEL_MESSAGES = 40;
export const MAXIMUM_TRANSCRIPT_ENTRIES = 60;

/**
 * Keeps the system prompt and the most recent turns. Cuts only at a user message, so an
 * assistant tool call is never separated from its tool results, which the model API rejects.
 */
export function trimSessionHistory(session: AssistantSession): AssistantSession {
  const [system, ...rest] = session.messages;
  let messages = session.messages;
  if (system?.role === 'system' && rest.length > MAXIMUM_MODEL_MESSAGES) {
    let start = rest.length - MAXIMUM_MODEL_MESSAGES;
    while (start < rest.length && rest[start]?.role !== 'user') start += 1;
    // Keep a page-change note that introduces the first kept turn.
    while (start > 0 && rest[start - 1]?.role === 'system') start -= 1;
    messages = [system, ...rest.slice(start)];
  }
  return { ...session, messages, transcript: session.transcript.slice(-MAXIMUM_TRANSCRIPT_ENTRIES) };
}
