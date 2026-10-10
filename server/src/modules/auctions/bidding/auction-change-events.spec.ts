import { decideAuctionChangeAnnouncement } from './auction-change-events';
import { ProxyBidResolution } from './proxy-bid-resolution';

const noBids: ProxyBidResolution = { leaderUserId: null, leaderMaxCents: null, priceCents: 100_00 };
const adaLeadsAt310: ProxyBidResolution = { leaderUserId: 'ada', leaderMaxCents: 500_00, priceCents: 310_00 };
const context = {
  auctionSlug: 'blue-hour-serigraph-1',
  artworkTitle: 'Blue Hour, Serigraph',
  endsAt: new Date('2026-01-15T13:00:00.000Z'),
  isExtended: false,
};

describe('decideAuctionChangeAnnouncement', () => {
  it('announces the public figures to the auction room, and nothing private', () => {
    const after: ProxyBidResolution = { leaderUserId: 'ada', leaderMaxCents: 500_00, priceCents: 100_00 };

    const announcement = decideAuctionChangeAnnouncement(noBids, after, { ...context, isExtended: true });

    expect(announcement.auctionChanged).toEqual({
      slug: 'blue-hour-serigraph-1',
      priceCents: 100_00,
      endsAt: '2026-01-15T13:00:00.000Z',
      extended: true,
    });
  });

  it('alerts no one on a first bid, because there was no leader to outbid', () => {
    const after: ProxyBidResolution = { leaderUserId: 'ada', leaderMaxCents: 500_00, priceCents: 100_00 };

    expect(decideAuctionChangeAnnouncement(noBids, after, context).userOutbid).toBeNull();
  });

  it('alerts the previous leader, at the new price, when someone takes the lead', () => {
    const after: ProxyBidResolution = { leaderUserId: 'bianca', leaderMaxCents: 600_00, priceCents: 510_00 };

    expect(decideAuctionChangeAnnouncement(adaLeadsAt310, after, context).userOutbid).toEqual({
      userId: 'ada',
      event: { slug: 'blue-hour-serigraph-1', artworkTitle: 'Blue Hour, Serigraph', priceCents: 510_00 },
    });
  });

  it('alerts no one when an existing maximum beats the bid at once, because the leader stays', () => {
    const after: ProxyBidResolution = { leaderUserId: 'ada', leaderMaxCents: 500_00, priceCents: 410_00 };

    const announcement = decideAuctionChangeAnnouncement(adaLeadsAt310, after, context);

    expect(announcement.userOutbid).toBeNull();
    expect(announcement.auctionChanged.priceCents).toBe(410_00);
  });

  it('alerts no one on a leader’s self-raise, but still announces the change', () => {
    const after: ProxyBidResolution = { leaderUserId: 'ada', leaderMaxCents: 800_00, priceCents: 310_00 };

    const announcement = decideAuctionChangeAnnouncement(adaLeadsAt310, after, context);

    expect(announcement.userOutbid).toBeNull();
    expect(announcement.auctionChanged.priceCents).toBe(310_00);
  });

  it('alerts no one on a self-raise that meets the reserve and moves the price', () => {
    const after: ProxyBidResolution = { leaderUserId: 'ada', leaderMaxCents: 1_000_00, priceCents: 900_00 };

    expect(decideAuctionChangeAnnouncement(adaLeadsAt310, after, context).userOutbid).toBeNull();
  });
});
