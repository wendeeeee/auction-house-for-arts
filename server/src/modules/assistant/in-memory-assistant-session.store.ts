import type { AssistantSession } from './assistant.types';
import type { AssistantSessionStore } from './assistant-session.store';
import { trimSessionHistory } from './session-history-trimming';

/** For tests: the same contract as the Redis store, without Redis. Sessions do not expire. */
export class InMemoryAssistantSessionStore implements AssistantSessionStore {
  private readonly sessions = new Map<string, string>();
  private readonly counters = new Map<string, { count: number; resetsAtMilliseconds: number }>();

  async find(sessionId: string): Promise<AssistantSession | null> {
    const raw = this.sessions.get(sessionId);
    return raw ? (JSON.parse(raw) as AssistantSession) : null;
  }

  async save(session: AssistantSession): Promise<void> {
    this.sessions.set(session.id, JSON.stringify(trimSessionHistory(session)));
  }

  async delete(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
  }

  async countMessage(userId: string, windowSeconds: number): Promise<number> {
    const now = Date.now();
    const current = this.counters.get(userId);
    const next =
      current && current.resetsAtMilliseconds > now
        ? { count: current.count + 1, resetsAtMilliseconds: current.resetsAtMilliseconds }
        : { count: 1, resetsAtMilliseconds: now + windowSeconds * 1_000 };
    this.counters.set(userId, next);
    return next.count;
  }

  get sessionCount(): number {
    return this.sessions.size;
  }
}
