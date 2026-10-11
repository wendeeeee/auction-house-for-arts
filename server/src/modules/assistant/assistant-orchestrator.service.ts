import { Inject, Injectable } from '@nestjs/common';
import { DomainError } from '../../common/errors';
import { AuthenticatedUser } from '../../common/identity';
import { withSpan } from '../../common/tracing';
import { ArtworkCatalogService } from '../artworks';
import { AuctionDetails, AuctionService, AuctionSummaryView, toAuctionDetailView, toAuctionSummaryView } from '../auctions';
import { ASSISTANT_LLM, AssistantLlm, AssistantUnavailableError, LlmMessage, LlmResponse } from '../language-models';
import { PageDescription, buildSystemPrompt, describePageContext } from './assistant-prompt';
import { parseAssistantReply } from './assistant-reply-parsing';
import { AssistantBidSuggestion, AssistantPageContext, AssistantSession, TranscriptEntry } from './assistant.types';
import { BidSuggestionRejection, decideBidSuggestionRejection } from './bid-suggestion-validation';
import { ToolRegistry } from './tools/tool-registry';

export const MAXIMUM_AGENT_ITERATIONS = 6;
export const MAXIMUM_RECOMMENDATIONS = 4;
export const FALLBACK_REPLY = 'Sorry, I could not finish that request. Could you try rephrasing it?';

export interface TurnStatistics {
  iterations: number;
  toolCalls: number;
  inputTokens: number;
  outputTokens: number;
  droppedRecommendations: number;
  bidSuggestionRejection: BidSuggestionRejection | null;
  isExhausted: boolean;
}

export interface CompletedTurn {
  readonly session: AssistantSession;
  readonly reply: TranscriptEntry;
  readonly statistics: TurnStatistics;
}

/**
 * The agent loop: the model calls read-only tools until it answers, at most
 * MAXIMUM_AGENT_ITERATIONS times. Afterwards the server, not the model, decides what the user
 * sees: recommendations only for auctions a tool returned, rebuilt from live rows, and a bid
 * suggestion only if it is valid for this user right now.
 */
@Injectable()
export class AssistantOrchestratorService {
  constructor(
    @Inject(ASSISTANT_LLM) private readonly llm: AssistantLlm,
    private readonly toolRegistry: ToolRegistry,
    private readonly auctionService: AuctionService,
    private readonly artworkCatalog: ArtworkCatalogService,
  ) {}

  runTurn(input: {
    readonly user: AuthenticatedUser;
    readonly session: AssistantSession;
    readonly message: string;
    readonly context: AssistantPageContext | null;
    readonly now: Date;
  }): Promise<CompletedTurn> {
    const { user, session, message, context, now } = input;
    return withSpan(
      'assistant.turn',
      {
        'assistant.session.id': session.id,
        'assistant.context': context ? `${context.type}:${context.slug}` : 'none',
        'gen_ai.system': this.llm.provider,
        'gen_ai.request.model': this.llm.model,
      },
      async (span) => {
        const messages: LlmMessage[] = [...session.messages];
        const knownAuctionSlugs = new Set(session.knownAuctionSlugs);
        const statistics: TurnStatistics = {
          iterations: 0,
          toolCalls: 0,
          inputTokens: 0,
          outputTokens: 0,
          droppedRecommendations: 0,
          bidSuggestionRejection: null,
          isExhausted: false,
        };

        const isNewSession = messages.length === 0;
        if (isNewSession || !isSamePage(context, session.context)) {
          const page = await this.describePage(context, user, now);
          if (page?.type === 'auction') knownAuctionSlugs.add(page.auctionSlug);
          if (page?.type === 'artwork' && page.openAuctionSlug) knownAuctionSlugs.add(page.openAuctionSlug);
          messages.push({ role: 'system', content: isNewSession ? buildSystemPrompt(user, page) : describePageContext(page) });
        }
        messages.push({ role: 'user', content: message });

        let finalContent: string | null = null;
        for (let iteration = 1; iteration <= MAXIMUM_AGENT_ITERATIONS; iteration += 1) {
          statistics.iterations = iteration;
          const response = await this.callModel(messages, iteration);
          statistics.inputTokens += response.usage.inputTokens;
          statistics.outputTokens += response.usage.outputTokens;

          if (response.toolCalls.length === 0) {
            finalContent = response.content ?? '';
            break;
          }
          messages.push({ role: 'assistant', content: response.content, toolCalls: response.toolCalls });
          for (const call of response.toolCalls) {
            statistics.toolCalls += 1;
            const executed = await withSpan('assistant.tool', { 'gen_ai.tool.name': call.name }, async (toolSpan) => {
              const result = await this.toolRegistry.execute(call.name, call.arguments, { user, now });
              toolSpan.setAttributes({ 'assistant.tool.successful': result.isSuccessful });
              return result;
            });
            executed.auctionSlugs.forEach((slug) => knownAuctionSlugs.add(slug));
            messages.push({ role: 'tool', toolCallId: call.id, content: executed.content });
          }
        }

        if (finalContent === null) {
          statistics.isExhausted = true;
          finalContent = FALLBACK_REPLY;
        }
        messages.push({ role: 'assistant', content: finalContent });

        const parsed = parseAssistantReply(finalContent);
        const accepted = parsed.recommendedAuctionSlugs.filter((slug) => knownAuctionSlugs.has(slug)).slice(0, MAXIMUM_RECOMMENDATIONS);
        statistics.droppedRecommendations = parsed.recommendedAuctionSlugs.length - accepted.length;
        const cards = await this.loadCards(accepted, now);

        let bidSuggestion: AssistantBidSuggestion | null = null;
        if (parsed.bidSuggestion) {
          const verdict = await this.verifyBidSuggestion(parsed.bidSuggestion, knownAuctionSlugs, user, now);
          if ('rejection' in verdict) statistics.bidSuggestionRejection = verdict.rejection;
          else bidSuggestion = verdict.suggestion;
        }

        const timestamp = now.toISOString();
        const reply: TranscriptEntry = {
          role: 'assistant',
          text: parsed.text || FALLBACK_REPLY,
          cards,
          bidSuggestion,
          followUpSuggestions: parsed.followUpSuggestions,
          createdAt: timestamp,
        };
        span.setAttributes({
          'assistant.iterations': statistics.iterations,
          'assistant.tool_calls': statistics.toolCalls,
          'gen_ai.usage.input_tokens': statistics.inputTokens,
          'gen_ai.usage.output_tokens': statistics.outputTokens,
          'assistant.recommendations': cards.length,
          'assistant.recommendations.dropped': statistics.droppedRecommendations,
          'assistant.bid_suggestion': bidSuggestion ? 'shown' : (statistics.bidSuggestionRejection ?? 'none'),
          'assistant.exhausted': statistics.isExhausted,
        });

        return {
          session: {
            ...session,
            context,
            messages,
            knownAuctionSlugs: [...knownAuctionSlugs],
            transcript: [...session.transcript, { role: 'user', text: message, createdAt: timestamp }, reply],
            updatedAt: timestamp,
          },
          reply,
          statistics,
        };
      },
    );
  }

  private async callModel(messages: readonly LlmMessage[], iteration: number): Promise<LlmResponse> {
    return withSpan(
      'assistant.model_call',
      { 'gen_ai.system': this.llm.provider, 'gen_ai.request.model': this.llm.model, 'assistant.iteration': iteration },
      async (span) => {
        let response: LlmResponse;
        try {
          response = await this.llm.complete(messages, this.toolRegistry.definitions);
        } catch (error) {
          if (error instanceof AssistantUnavailableError) throw error;
          throw new AssistantUnavailableError('provider_failed', error);
        }
        span.setAttributes({
          'gen_ai.usage.input_tokens': response.usage.inputTokens,
          'gen_ai.usage.output_tokens': response.usage.outputTokens,
          'assistant.tool_calls': response.toolCalls.length,
        });
        return response;
      },
    );
  }

  /** A missing page is not an error: the conversation carries on as if browsing. */
  private async describePage(
    context: AssistantPageContext | null,
    user: AuthenticatedUser,
    now: Date,
  ): Promise<PageDescription | null> {
    if (context === null) return null;
    try {
      if (context.type === 'auction') {
        const view = toAuctionDetailView(await this.auctionService.getAuctionDetails(context.slug, user), now);
        return {
          type: 'auction',
          auctionSlug: view.slug,
          artworkTitle: view.artwork.title,
          artistName: view.artwork.artist.name,
          priceCents: view.priceCents,
          isOpen: view.status === 'open',
        };
      }
      const artwork = await this.artworkCatalog.getArtworkBySlug(context.slug);
      const [openAuction] = await this.auctionService.listAuctions({
        status: 'open',
        artwork: context.slug,
        medium: undefined,
        sort: 'ending_soon',
        limit: 1,
      });
      return {
        type: 'artwork',
        artworkSlug: artwork.artwork.slug,
        artworkTitle: artwork.artwork.title,
        artistName: artwork.artist.name,
        openAuctionSlug: openAuction?.auction.slug ?? null,
      };
    } catch (error) {
      if (error instanceof DomainError && error.httpStatus === 404) return null;
      throw error;
    }
  }

  private async loadCards(auctionSlugs: readonly string[], now: Date): Promise<AuctionSummaryView[]> {
    const cards: AuctionSummaryView[] = [];
    for (const slug of auctionSlugs) {
      const details = await this.findAuctionDetails(slug, null);
      if (details) cards.push(toAuctionSummaryView(details, now));
    }
    return cards;
  }

  private async verifyBidSuggestion(
    suggestion: { readonly auctionSlug: string; readonly amountCents: number },
    knownAuctionSlugs: ReadonlySet<string>,
    user: AuthenticatedUser,
    now: Date,
  ): Promise<{ suggestion: AssistantBidSuggestion } | { rejection: BidSuggestionRejection }> {
    const wasSeenInSession = knownAuctionSlugs.has(suggestion.auctionSlug);
    const details = wasSeenInSession ? await this.findAuctionDetails(suggestion.auctionSlug, user) : null;
    const view = details ? toAuctionDetailView(details, now) : null;
    const rejection = decideBidSuggestionRejection({ wasSeenInSession, auction: view, amountCents: suggestion.amountCents });
    if (rejection !== null || view === null) return { rejection: rejection ?? 'auction_not_found' };
    return {
      suggestion: {
        auctionSlug: view.slug,
        artworkTitle: view.artwork.title,
        amountCents: suggestion.amountCents,
        minimumNextBidCents: view.minimumNextBidCents,
      },
    };
  }

  private async findAuctionDetails(slug: string, viewer: AuthenticatedUser | null): Promise<AuctionDetails | null> {
    try {
      return await this.auctionService.getAuctionDetails(slug, viewer);
    } catch (error) {
      if (error instanceof DomainError && error.httpStatus === 404) return null;
      throw error;
    }
  }
}

function isSamePage(first: AssistantPageContext | null, second: AssistantPageContext | null): boolean {
  return first?.type === second?.type && first?.slug === second?.slug;
}
