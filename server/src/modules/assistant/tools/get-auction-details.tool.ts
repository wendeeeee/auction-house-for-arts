import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { AuctionService, BID_HISTORY_KINDS, toAuctionDetailView } from '../../auctions';
import { toSellerText } from '../seller-text';
import { AssistantTool, ToolContext, ToolResult } from './assistant-tool';
import { auctionForModelSchema, toAuctionForModel } from './auction-for-model';

const AUCTION_SLUG = z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(140);
const HISTORY_ENTRIES_FOR_MODEL = 10;

const argumentsSchema = z.strictObject({ auctionSlug: AUCTION_SLUG });
type GetAuctionDetailsArguments = z.infer<typeof argumentsSchema>;

const outputSchema = auctionForModelSchema.extend({
  description: z.string(),
  artistBio: z.string(),
  sellerHandle: z.string(),
  leaderHandle: z.string().nullable(),
  minimumNextBidCents: z.number().int(),
  originalEndsAt: z.string(),
  recentBids: z.array(
    z.strictObject({
      bidderHandle: z.string(),
      amountCents: z.number().int(),
      kind: z.enum(BID_HISTORY_KINDS),
      at: z.string(),
    }),
  ),
  youAreLeading: z.boolean(),
  yourMaximumBidCents: z.number().int().nullable().describe('The current user’s own maximum; theirs to see.'),
  youMayBid: z.boolean(),
});
type GetAuctionDetailsOutput = z.infer<typeof outputSchema>;

@Injectable()
export class GetAuctionDetailsTool implements AssistantTool<GetAuctionDetailsArguments, GetAuctionDetailsOutput> {
  readonly name = 'get_auction_details';
  readonly description =
    'One auction: the artwork and artist, price, minimum next bid, reserve status (met or not, never the amount), time left, extensions, recent bids, and the current user’s own position.';
  readonly argumentsSchema = argumentsSchema;
  readonly outputSchema = outputSchema;

  constructor(private readonly auctionService: AuctionService) {}

  async run({ auctionSlug }: GetAuctionDetailsArguments, { user, now }: ToolContext): Promise<ToolResult<GetAuctionDetailsOutput>> {
    const details = await this.auctionService.getAuctionDetails(auctionSlug, user);
    const view = toAuctionDetailView(details, now);
    return {
      output: {
        ...toAuctionForModel(view, now),
        description: toSellerText(details.artwork.artwork.description),
        artistBio: toSellerText(details.artwork.artist.bio, 800),
        sellerHandle: view.sellerHandle,
        leaderHandle: view.leaderHandle,
        minimumNextBidCents: view.minimumNextBidCents,
        originalEndsAt: view.originalEndsAt,
        recentBids: view.history.slice(0, HISTORY_ENTRIES_FOR_MODEL).map((entry) => ({
          bidderHandle: entry.bidderHandle,
          amountCents: entry.amountCents,
          kind: entry.kind,
          at: entry.createdAt,
        })),
        youAreLeading: view.youAreLeading,
        yourMaximumBidCents: view.yourMaxBidCents,
        youMayBid: view.youMayBid,
      },
      auctionSlugs: [view.slug],
    };
  }
}
