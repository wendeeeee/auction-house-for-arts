import { randomUUID } from 'node:crypto';
import { createClient } from 'redis';
import { AppConfig, loadConfiguration } from '../../src/config';
import {
  AssistantSession,
  RedisAssistantSessionStore,
  SESSION_TTL_SECONDS,
  messageCountKey,
  sessionKey,
} from '../../src/modules/assistant';

/** Needs the Redis container (`npm run infra:up`). Keys are random per test, so runs never collide. */
describe('RedisAssistantSessionStore', () => {
  const config: AppConfig = loadConfiguration(process.env);
  const store = new RedisAssistantSessionStore(config);
  const redis = createClient({ url: config.redis.url });

  beforeAll(async () => {
    await redis.connect();
  });

  afterAll(async () => {
    await store.onApplicationShutdown();
    await redis.close();
  });

  function newSession(messageCount = 1): AssistantSession {
    return {
      id: randomUUID(),
      userId: randomUUID(),
      context: { type: 'auction', slug: 'harmattan-light-ab12cd' },
      messages: [
        { role: 'system', content: 'system' },
        ...Array.from({ length: messageCount }, (_, index) => ({ role: 'user' as const, content: `message ${index}` })),
      ],
      transcript: [],
      knownAuctionSlugs: ['harmattan-light-ab12cd'],
      createdAt: '2026-01-15T12:00:00.000Z',
      updatedAt: '2026-01-15T12:00:00.000Z',
    };
  }

  it('stores a session with a day-long TTL and reads it back', async () => {
    const session = newSession();
    await store.save(session);
    expect(await store.find(session.id)).toEqual(session);
    const ttl = await redis.ttl(sessionKey(session.id));
    expect(ttl).toBeGreaterThan(SESSION_TTL_SECONDS - 10);
    expect(ttl).toBeLessThanOrEqual(SESSION_TTL_SECONDS);
  });

  it('trims long histories before storing', async () => {
    const session = newSession(100);
    await store.save(session);
    const stored = await store.find(session.id);
    expect(stored?.messages.length).toBeLessThan(session.messages.length);
    expect(stored?.messages[0]).toEqual({ role: 'system', content: 'system' });
  });

  it('deletes a session, and answers null for an unknown one', async () => {
    const session = newSession();
    await store.save(session);
    await store.delete(session.id);
    expect(await store.find(session.id)).toBeNull();
    expect(await store.find(randomUUID())).toBeNull();
  });

  it('counts messages in a window whose expiry is set once, when it opens', async () => {
    const userId = randomUUID();
    expect(await store.countMessage(userId, 3_600)).toBe(1);
    const firstTtl = await redis.ttl(messageCountKey(userId));
    expect(await store.countMessage(userId, 3_600)).toBe(2);
    expect(await store.countMessage(userId, 3_600)).toBe(3);
    expect(firstTtl).toBeGreaterThan(3_590);
    expect(await redis.ttl(messageCountKey(userId))).toBeLessThanOrEqual(firstTtl);
  });

  it('starts a new window once the old one expires', async () => {
    const userId = randomUUID();
    await store.countMessage(userId, 1);
    await store.countMessage(userId, 1);
    await new Promise((resolve) => setTimeout(resolve, 1_200));
    expect(await store.countMessage(userId, 1)).toBe(1);
  });
});
