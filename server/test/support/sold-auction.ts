import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { AuctionCloseService } from '../../src/modules/closing';
import { auctionApi } from './auction-api';
import { FakeClock } from './fake-clock';

export interface AuctionToRun {
  readonly sellerHandle: string;
  readonly artworkSlug: string;
  readonly reservePriceCents?: number;
  /** In order: [bidder handle, maximum bid in cents]. */
  readonly bids: readonly (readonly [string, number])[];
}

/** Opens an auction, places the bids, then closes it as the worker would. Returns the slug. */
export async function runAuctionToClose(app: NestFastifyApplication, clock: FakeClock, auction: AuctionToRun): Promise<string> {
  const api = auctionApi(app);
  const endsAt = new Date(clock.now().getTime() + 60 * 60 * 1_000);
  const created = await api.create(auction.sellerHandle, {
    artworkSlug: auction.artworkSlug,
    startingPriceCents: 100_00,
    reservePriceCents: auction.reservePriceCents,
    endsAt: endsAt.toISOString(),
  });
  if (created.statusCode !== 201) throw new Error(`Could not create the auction: ${created.body}`);
  const slug = created.json().slug as string;

  clock.advanceBySeconds(60);
  for (const [bidderHandle, maxBidCents] of auction.bids) {
    const bid = await api.bid(bidderHandle, slug, maxBidCents);
    if (bid.statusCode !== 201) throw new Error(`Bid by ${bidderHandle} was rejected: ${bid.body}`);
  }

  clock.setTo(new Date(endsAt.getTime() + 5_000));
  const summary = await app.get(AuctionCloseService).closeDueAuctions();
  if (summary.closed !== 1) throw new Error(`Expected one auction to close, got ${JSON.stringify(summary)}`);
  return slug;
}
