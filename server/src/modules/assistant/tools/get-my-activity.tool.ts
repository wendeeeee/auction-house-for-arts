import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { AuctionService, toAuctionSummaryView } from '../../auctions';
import { AuctionCloseService } from '../../closing';
import { PurchaseService } from '../../purchases';
import { ACTIVITY_RELATIONSHIPS, decideActivityRelationship } from './activity-relationship';
import { AssistantTool, ToolContext, ToolResult } from './assistant-tool';
import { auctionForModelSchema, toAuctionForModel } from './auction-for-model';

const ACTIVITY_LIMIT = 25;

/** No arguments at all: the user is the one making the request, never someone the model names. */
const argumentsSchema = z.strictObject({});
type GetMyActivityArguments = z.infer<typeof argumentsSchema>;

const outputSchema = z.strictObject({
  you: z.string(),
  auctions: z.array(
    auctionForModelSchema.extend({
      relationship: z.enum(ACTIVITY_RELATIONSHIPS),
      yourMaximumBidCents: z.number().int().nullable(),
      paymentStatus: z.enum(['awaiting_payment', 'paid']).nullable().describe('Only for auctions you won.'),
    }),
  ),
});
type GetMyActivityOutput = z.infer<typeof outputSchema>;

@Injectable()
export class GetMyActivityTool implements AssistantTool<GetMyActivityArguments, GetMyActivityOutput> {
  readonly name = 'get_my_activity';
  readonly description =
    'The current user’s auctions: leading, outbid (with their own maximum), won (with payment status), lost, reserve not met, or selling. Takes no arguments; the server knows who the user is.';
  readonly argumentsSchema = argumentsSchema;
  readonly outputSchema = outputSchema;

  constructor(
    private readonly auctionService: AuctionService,
    private readonly auctionCloseService: AuctionCloseService,
    private readonly purchaseService: PurchaseService,
  ) {}

  async run(_args: GetMyActivityArguments, { user, now }: ToolContext): Promise<ToolResult<GetMyActivityOutput>> {
    const participations = await this.auctionService.listAuctionsForParticipant(user.id, ACTIVITY_LIMIT);
    const auctionIds = participations.map((participation) => participation.auction.id);
    const [closes, paymentStatuses] = await Promise.all([
      this.auctionCloseService.findClosesByAuctionIds(auctionIds),
      this.purchaseService.findPaymentStatusesByAuctionIds(auctionIds),
    ]);
    const closesByAuctionId = new Map(closes.map((close) => [close.auctionId, close]));

    const auctions = participations.map((participation) => {
      const summary = toAuctionSummaryView(participation, now);
      const relationship = decideActivityRelationship({
        userId: user.id,
        sellerUserId: participation.auction.sellerUserId,
        leaderUserId: participation.auction.leaderUserId,
        status: summary.status,
        close: closesByAuctionId.get(participation.auction.id) ?? null,
      });
      return {
        ...toAuctionForModel(summary, now),
        relationship,
        yourMaximumBidCents: participation.ownMaximumBidCents,
        paymentStatus: relationship === 'won' ? (paymentStatuses.get(participation.auction.id) ?? 'awaiting_payment') : null,
      };
    });
    return { output: { you: `@${user.handle}`, auctions }, auctionSlugs: auctions.map((auction) => auction.auctionSlug) };
  }
}
