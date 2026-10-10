import { afterEach, describe, expect, it, vi } from 'vitest';
import { getAssistantSession, sendAssistantMessage } from './assistant-api';
import {
  assistantContextFromPath,
  assistantSessionKey,
  bidPrefillHref,
  starterPrompts,
  suggestedMaximumBidFrom,
} from './assistant-context';

afterEach(() => vi.unstubAllGlobals());

function stubFetch(status: number, body: unknown) {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

describe('page context', () => {
  it('comes only from auction and artwork detail pages', () => {
    expect(assistantContextFromPath('/auctions/harmattan-light-ab12cd')).toEqual({ type: 'auction', slug: 'harmattan-light-ab12cd' });
    expect(assistantContextFromPath('/artworks/quiet-bronze')).toEqual({ type: 'artwork', slug: 'quiet-bronze' });
    expect(assistantContextFromPath('/auctions/x-1/checkout/success')).toBeUndefined();
    expect(assistantContextFromPath('/auctions')).toBeUndefined();
    expect(assistantContextFromPath('/artworks/../admin')).toBeUndefined();
  });

  it('offers starter prompts that fit the page', () => {
    expect(starterPrompts({ type: 'auction', slug: 'x' })).toContain('What should I bid on this?');
    expect(starterPrompts({ type: 'artwork', slug: 'x' })).toContain('Tell me about this work');
    expect(starterPrompts(undefined)).toContain('How are my bids doing?');
  });

  it('keeps one conversation per demo user', () => {
    expect(assistantSessionKey('a')).not.toBe(assistantSessionKey('b'));
  });
});

describe('bid suggestion pre-fill', () => {
  it('round-trips a suggested maximum through the auction URL', () => {
    const href = bidPrefillHref({ auctionSlug: 'harmattan-light-ab12cd', amountCents: 475_050 });
    expect(href).toBe('/auctions/harmattan-light-ab12cd?maximumBid=4750.50');
    expect(suggestedMaximumBidFrom(href.slice(href.indexOf('?')))).toBe('4750.50');
    expect(suggestedMaximumBidFrom('?maximumBid=3200')).toBe('3200');
  });

  it('ignores anything that is not a plain dollar amount', () => {
    for (const search of ['?maximumBid=1e9', '?maximumBid=<script>', '?maximumBid=-5', '?maximumBid=0', '']) {
      expect(suggestedMaximumBidFrom(search)).toBe('');
    }
  });
});

describe('assistant client', () => {
  it('sends the message and page context, never a user ID', async () => {
    const fetchMock = stubFetch(200, { sessionId: 's1', message: 'Hi', cards: [], bidSuggestion: null, followUpSuggestions: [] });
    await sendAssistantMessage({ sessionId: 's1', message: 'What should I bid?', context: { type: 'auction', slug: 'lot-1' } });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('/api/assistant/chat');
    expect(JSON.parse(init.body as string)).toEqual({
      sessionId: 's1',
      message: 'What should I bid?',
      context: { type: 'auction', slug: 'lot-1' },
    });
  });

  it('treats a missing or foreign session as a fresh conversation', async () => {
    stubFetch(404, { error: { code: 'ASSISTANT_SESSION_NOT_FOUND', message: 'No Concierge conversation with this ID.', details: {} } });
    await expect(getAssistantSession('gone')).resolves.toBeNull();
  });

  it('surfaces rate limits and outages with their codes', async () => {
    stubFetch(429, { error: { code: 'ASSISTANT_RATE_LIMITED', message: 'Too many messages', details: {} } });
    await expect(sendAssistantMessage({ message: 'hi' })).rejects.toMatchObject({ code: 'ASSISTANT_RATE_LIMITED', message: 'Too many messages' });
  });
});
