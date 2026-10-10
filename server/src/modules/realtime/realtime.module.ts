import { Module } from '@nestjs/common';
import { UsersModule } from '../users';
import { AUCTION_EVENT_PUBLISHER, SocketIoAuctionEventPublisher } from './auction-event.publisher';
import { AuctionEventsGateway } from './auction-events.gateway';

/**
 * Real-time signalling. Depends only on users (for handshake identity), never on auctions:
 * auctions imports this module to publish, so the dependency runs one way.
 */
@Module({
  imports: [UsersModule],
  providers: [AuctionEventsGateway, { provide: AUCTION_EVENT_PUBLISHER, useClass: SocketIoAuctionEventPublisher }],
  exports: [AUCTION_EVENT_PUBLISHER],
})
export class RealtimeModule {}
