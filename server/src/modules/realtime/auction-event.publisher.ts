import { Injectable } from '@nestjs/common';
import { AuctionEventsGateway } from './auction-events.gateway';
import {
  AUCTION_CHANGED_EVENT,
  AuctionChangeAnnouncement,
  USER_OUTBID_EVENT,
  auctionRoom,
  userRoom,
} from './realtime.types';


export interface AuctionEventPublisher {

  publish(announcement: AuctionChangeAnnouncement): void;
}

export const AUCTION_EVENT_PUBLISHER = Symbol('AUCTION_EVENT_PUBLISHER');

/**
 * Emits through the gateway's Socket.IO server. With the Redis adapter (main.ts), `to(room).emit`
 
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
