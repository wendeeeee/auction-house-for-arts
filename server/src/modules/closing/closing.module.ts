import { Module } from '@nestjs/common';
import { ArtworksModule } from '../artworks';
import { AuctionsModule } from '../auctions';
import { OutboxModule } from '../outbox';
import { RealtimeEmitterModule } from '../realtime';
import { UsersModule } from '../users';
import { AuctionCloseRepository } from './auction-close.repository';
import { AuctionCloseService } from './auction-close.service';
import { ClosingController } from './closing.controller';

/** Depends on auctions, never the reverse. Its poller is registered in WorkersModule only. */
@Module({
  imports: [AuctionsModule, ArtworksModule, OutboxModule, UsersModule, RealtimeEmitterModule],
  controllers: [ClosingController],
  providers: [AuctionCloseRepository, AuctionCloseService],
  exports: [AuctionCloseService],
})
export class ClosingModule {}
