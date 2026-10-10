import { Injectable } from '@nestjs/common';
import { AuctionRepository } from './auction.repository';
import { Auction, MaximumBid } from './auctions.types';
import { MaximumBidRepository } from './maximum-bid.repository';

/** The closing module's only way into the auctions tables. */
@Injectable()
export class AuctionClosingService {
  constructor(
    private readonly auctionRepository: AuctionRepository,
    private readonly maximumBidRepository: MaximumBidRepository,
  ) {}

  findDueAuctionIds(now: Date, limit: number): Promise<string[]> {
    return this.auctionRepository.findDueForClosingIds(now, limit);
  }

  lockUnclosedAuctionForClosing(auctionId: string): Promise<Auction | null> {
    return this.auctionRepository.lockUnclosedForClosing(auctionId);
  }

  listMaximumBids(auctionId: string): Promise<MaximumBid[]> {
    return this.maximumBidRepository.listForAuction(auctionId);
  }

  markAuctionClosed(auctionId: string, closedAt: Date): Promise<void> {
    return this.auctionRepository.markClosed(auctionId, closedAt);
  }

  findAuctionBySlug(slug: string): Promise<Auction | null> {
    return this.auctionRepository.findBySlug(slug);
  }
}
