import { Inject, Injectable, Logger, OnApplicationShutdown } from '@nestjs/common';
import { createClient } from 'redis';
import { APP_CONFIG, AppConfig } from '../../config';
import type { AssistantSession } from './assistant.types';
import { trimSessionHistory } from './session-history-trimming';

/** Injection token for the active `AssistantSessionStore`: Redis, or the in-memory one in tests. */
export const ASSISTANT_SESSION_STORE = Symbol('ASSISTANT_SESSION_STORE');

export const SESSION_TTL_SECONDS = 24 * 60 * 60;
export const ASSISTANT_KEY_PREFIX = 'assistant:';

export interface AssistantSessionStore {
  find(sessionId: string): Promise<AssistantSession | null>;
  /** Trims the history, then stores it with a fresh TTL. */
  save(session: AssistantSession): Promise<void>;
  delete(sessionId: string): Promise<void>;
  /** Counts one message in the user's fixed window and returns the count so far. */
  countMessage(userId: string, windowSeconds: number): Promise<number>;
}

export const sessionKey = (sessionId: string): string => `${ASSISTANT_KEY_PREFIX}session:${sessionId}`;
export const messageCountKey = (userId: string): string => `${ASSISTANT_KEY_PREFIX}messages:${userId}`;

/** Sessions and rate limits in Redis, so every API instance sees the same conversation and the same count. */
@Injectable()
export class RedisAssistantSessionStore implements AssistantSessionStore, OnApplicationShutdown {
  private readonly logger = new Logger(RedisAssistantSessionStore.name);
  private client: Promise<ReturnType<typeof createClient>> | null = null;

  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  async find(sessionId: string): Promise<AssistantSession | null> {
    const raw = await (await this.connected()).get(sessionKey(sessionId));
    return raw ? (JSON.parse(raw) as AssistantSession) : null;
  }

  async save(session: AssistantSession): Promise<void> {
    await (await this.connected()).set(sessionKey(session.id), JSON.stringify(trimSessionHistory(session)), {
      expiration: { type: 'EX', value: SESSION_TTL_SECONDS },
    });
  }

  async delete(sessionId: string): Promise<void> {
    await (await this.connected()).del(sessionKey(sessionId));
  }

  async countMessage(userId: string, windowSeconds: number): Promise<number> {
    const key = messageCountKey(userId);
    // One round trip, and NX sets the expiry only when the window opens: a separate EXPIRE after
    // a crash-interrupted INCR could leave a counter that never resets.
    const [count] = await (await this.connected()).multi().incr(key).expire(key, windowSeconds, 'NX').exec();
    return Number(count);
  }

  async onApplicationShutdown(): Promise<void> {
    const client = await this.client?.catch(() => null);
    if (client?.isOpen) await client.close();
  }

  private connected(): Promise<ReturnType<typeof createClient>> {
    if (this.client) return this.client;
    const client = createClient({ url: this.config.redis.url });
    // Without a listener, node-redis rethrows connection errors as uncaught exceptions.
    client.on('error', (error: unknown) => this.logger.error(`Redis: ${error instanceof Error ? error.message : String(error)}`));
    this.client = client.connect().then(() => client);
    this.client.catch(() => {
      this.client = null;
    });
    return this.client;
  }
}
