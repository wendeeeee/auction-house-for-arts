import type { AuctionChangeAnnouncement, AuctionEventPublisher } from '../../src/modules/realtime';

/**
 * Records announcements instead of emitting them. Override `AUCTION_EVENT_PUBLISHER` with an
 * instance, then assert on `announcements`.
 */
export class CapturingAuctionEventPublisher implements AuctionEventPublisher {
  readonly announcements: AuctionChangeAnnouncement[] = [];

  publish(announcement: AuctionChangeAnnouncement): void {
    this.announcements.push(announcement);
  }

  clear(): void {
    this.announcements.length = 0;
  }
}
