import { Module } from '@nestjs/common';
import { ArtworksModule } from '../artworks';
import { UsersModule } from '../users';
import { AuctionRepository } from './auction.repository';
import { AuctionService } from './auction.service';
import { AuctionsController } from './auctions.controller';
import { BidHistoryRepository } from './bid-history.repository';
import { BiddingService } from './bidding.service';
import { BidsController } from './bids.controller';
import { MaximumBidRepository } from './maximum-bid.repository';

@Module({
  imports: [ArtworksModule, UsersModule],
  controllers: [AuctionsController, BidsController],
  providers: [AuctionRepository, MaximumBidRepository, BidHistoryRepository, AuctionService, BiddingService],
  exports: [AuctionService, BiddingService],
})
export class AuctionsModule {}
