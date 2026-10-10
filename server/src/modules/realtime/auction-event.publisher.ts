import { Injectable } from '@nestjs/common';
import { AuctionEventsGateway } from './auction-events.gateway';
import {
  AUCTION_CHANGED_EVENT,
  AuctionChangeAnnouncement,
  USER_OUTBID_EVENT,
  auctionRoom,
  userRoom,
} from './realtime.types';

/**
 * How the auctions module announces a committed change. Callers must publish only after their
 * transaction commits: an announced bid that then rolled back would show viewers a price that
 * never existed. Tests bind the token to a capturing fake, so they need no Socket.IO.
 */
export interface AuctionEventPublisher {
  /** Fire-and-forget: delivery is best effort, and clients refetch on reconnect. */
  publish(announcement: AuctionChangeAnnouncement): void;
}

export const AUCTION_EVENT_PUBLISHER = Symbol('AUCTION_EVENT_PUBLISHER');

/**
 * Emits through the gateway's Socket.IO server. With the Redis adapter (main.ts), `to(room).emit`
 * reaches that room's sockets on every API instance, not only this one.
 */
@Injectable()
export class SocketIoAuctionEventPublisher implements AuctionEventPublisher {
  constructor(private readonly gateway: AuctionEventsGateway) {}

  publish(announcement: AuctionChangeAnnouncement): void {
    const { auctionChanged, userOutbid } = announcement;
    this.gateway.server.to(auctionRoom(auctionChanged.slug)).emit(AUCTION_CHANGED_EVENT, auctionChanged);
    if (userOutbid) {
      this.gateway.server.to(userRoom(userOutbid.userId)).emit(USER_OUTBID_EVENT, userOutbid.event);
    }
  }
}
