import { parseAssistantReply } from './assistant-reply-parsing';

describe('parseAssistantReply', () => {
  it('extracts tags and strips them from the visible text', () => {
    const parsed = parseAssistantReply(
      'Two good options.\n\n[[AUCTIONS:lot-one, lot-two,lot-one]]\n[[BID:lot-one:4,750]]\n[[SUGGESTIONS:Something smaller|Ending today]]',
    );
    expect(parsed).toEqual({
      text: 'Two good options.',
      recommendedAuctionSlugs: ['lot-one', 'lot-two'],
      bidSuggestion: { auctionSlug: 'lot-one', amountCents: 475_000 },
      followUpSuggestions: ['Something smaller', 'Ending today'],
    });
  });

  it('reads dollars and cents exactly', () => {
    expect(parseAssistantReply('[[BID:lot-one:$1,234.50]]').bidSuggestion).toEqual({ auctionSlug: 'lot-one', amountCents: 123_450 });
  });

  it('ignores a malformed amount or slug rather than guessing', () => {
    expect(parseAssistantReply('[[BID:lot-one:12.345]]').bidSuggestion).toBeNull();
    expect(parseAssistantReply('[[BID:lot-one:1,2,3]]').bidSuggestion).toBeNull();
    expect(parseAssistantReply('[[AUCTIONS:Not A Slug,ok-slug]]').recommendedAuctionSlugs).toEqual(['ok-slug']);
  });

  it('returns plain text when there are no tags', () => {
    expect(parseAssistantReply('Proxy bidding means we bid for you.')).toEqual({
      text: 'Proxy bidding means we bid for you.',
      recommendedAuctionSlugs: [],
      bidSuggestion: null,
      followUpSuggestions: [],
    });
  });

  it('caps follow-up suggestions at three short ones', () => {
    const long = 'x'.repeat(61);
    expect(parseAssistantReply(`[[SUGGESTIONS:a|${long}|b|c|d]]`).followUpSuggestions).toEqual(['a', 'b', 'c']);
  });
});
