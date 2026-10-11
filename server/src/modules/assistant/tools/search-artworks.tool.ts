import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { ARTWORK_MEDIUMS } from '../../artworks';
import { AUCTION_LIST_SORTS, AUCTION_STATUS_FILTERS, toAuctionSummaryView } from '../../auctions';
import { ArtworkSearchService, MAXIMUM_ENDING_WITHIN_HOURS, MAXIMUM_SEARCH_KEYWORDS } from '../../search';
import { AssistantTool, ToolContext, ToolResult } from './assistant-tool';
import { auctionForModelSchema, toAuctionForModel } from './auction-for-model';

const argumentsSchema = z.strictObject({
  keywords: z
    .array(z.string().trim().min(2).max(40))
    .max(MAXIMUM_SEARCH_KEYWORDS)
    .optional()
    .describe('1–4 short subject or material terms, e.g. "seascape", "oil", "bronze". Matches title, description, and artist name.'),
  medium: z.enum(ARTWORK_MEDIUMS).optional(),
  artist: z.string().trim().min(2).max(80).optional().describe('An artist name or @handle.'),
  status: z.enum(AUCTION_STATUS_FILTERS).default('open'),
  minPriceDollars: z.number().positive().max(1_000_000_000).optional(),
  maxPriceDollars: z.number().positive().max(1_000_000_000).optional().describe('At or below this current price, in US dollars.'),
  endingWithinHours: z.number().int().min(1).max(MAXIMUM_ENDING_WITHIN_HOURS).optional(),
  sort: z.enum(AUCTION_LIST_SORTS).default('ending_soon'),
  limit: z.number().int().min(1).max(8).default(5),
});
type SearchArtworksArguments = z.infer<typeof argumentsSchema>;

const outputSchema = z.strictObject({
  resultCount: z.number().int(),
  auctions: z.array(auctionForModelSchema),
});
type SearchArtworksOutput = z.infer<typeof outputSchema>;

const toCents = (dollars: number | undefined): number | null => (dollars === undefined ? null : Math.round(dollars) * 100);

@Injectable()
export class SearchArtworksTool implements AssistantTool<SearchArtworksArguments, SearchArtworksOutput> {
  readonly name = 'search_artworks';
  readonly description = 'Search the auction catalog. Returns real auctions only. Call this before recommending anything.';
  readonly argumentsSchema = argumentsSchema;
  readonly outputSchema = outputSchema;

  constructor(private readonly artworkSearch: ArtworkSearchService) {}

  async run(args: SearchArtworksArguments, { now }: ToolContext): Promise<ToolResult<SearchArtworksOutput>> {
    const listings = await this.artworkSearch.searchAuctions(
      {
        keywords: args.keywords?.map((keyword) => keyword.toLowerCase()) ?? [],
        medium: args.medium ?? null,
        artist: args.artist ?? null,
        status: args.status,
        minPriceCents: toCents(args.minPriceDollars),
        maxPriceCents: toCents(args.maxPriceDollars),
        endingWithinHours: args.endingWithinHours ?? null,
        sort: args.sort,
      },
      args.limit,
    );
    const auctions = listings.map((listing) => toAuctionForModel(toAuctionSummaryView(listing, now), now));
    return { output: { resultCount: auctions.length, auctions }, auctionSlugs: auctions.map((auction) => auction.auctionSlug) };
  }
}
