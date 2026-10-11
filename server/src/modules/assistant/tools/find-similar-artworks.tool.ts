import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { ArtworkCatalogService } from '../../artworks';
import { AuctionService, toAuctionSummaryView } from '../../auctions';
import { AssistantTool, ToolContext, ToolResult } from './assistant-tool';
import { auctionForModelSchema, toAuctionForModel } from './auction-for-model';

const CANDIDATE_LIMIT = 50;

const argumentsSchema = z.strictObject({
  auctionSlug: z.string().regex(/^[a-z0-9]+(-[a-z0-9]+)*$/).max(140),
  limit: z.number().int().min(1).max(8).default(4),
});
type FindSimilarArtworksArguments = z.infer<typeof argumentsSchema>;

const outputSchema = z.strictObject({
  similarTo: z.string(),
  auctions: z.array(auctionForModelSchema),
});
type FindSimilarArtworksOutput = z.infer<typeof outputSchema>;

/** Same medium or same artist, open, closest in price first. Phase 8 replaces this with vector similarity. */
@Injectable()
export class FindSimilarArtworksTool implements AssistantTool<FindSimilarArtworksArguments, FindSimilarArtworksOutput> {
  readonly name = 'find_similar_artworks';
  readonly description = 'Open auctions of works in the same medium or by the same artist as the given auction, closest in price first.';
  readonly argumentsSchema = argumentsSchema;
  readonly outputSchema = outputSchema;

  constructor(
    private readonly auctionService: AuctionService,
    private readonly artworkCatalog: ArtworkCatalogService,
  ) {}

  async run(
    { auctionSlug, limit }: FindSimilarArtworksArguments,
    { now }: ToolContext,
  ): Promise<ToolResult<FindSimilarArtworksOutput>> {
    const base = await this.auctionService.getAuctionDetails(auctionSlug, null);
    const [sameMedium, sameArtist] = await Promise.all([
      this.artworkCatalog.findArtworkIdsByMedium(base.artwork.artwork.medium),
      this.artworkCatalog.findArtworkIdsMatching({ keywords: [], medium: null, artistIds: [base.artwork.artist.id] }),
    ]);
    const artworkIds = [...new Set([...sameMedium, ...sameArtist])].filter((id) => id !== base.auction.artworkId);
    const candidates = await this.auctionService.searchAuctions({
      artworkIds,
      status: 'open',
      minimumPriceCents: null,
      maximumPriceCents: null,
      endingWithinHours: null,
      sort: 'ending_soon',
      limit: CANDIDATE_LIMIT,
    });
    const basePriceCents = base.auction.currentPriceCents;
    const closest = [...candidates]
      .sort((first, second) => Math.abs(first.auction.currentPriceCents - basePriceCents) - Math.abs(second.auction.currentPriceCents - basePriceCents))
      .slice(0, limit);
    const auctions = closest.map((listing) => toAuctionForModel(toAuctionSummaryView(listing, now), now));
    return {
      output: { similarTo: base.auction.slug, auctions },
      auctionSlugs: [base.auction.slug, ...auctions.map((auction) => auction.auctionSlug)],
    };
  }
}
