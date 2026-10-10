import { Inject, Injectable, Logger, Optional } from '@nestjs/common';
import { Clock } from '../../../common/clock';
import { withSpan } from '../../../common/tracing';
import { ASSISTANT_LLM, AssistantLlm } from '../../language-models';
import { EMPTY_SEARCH_FILTERS, InterpretedQuery, SearchFilters } from '../search.types';
import { INTERPRETATION_JSON_SCHEMA, INTERPRETATION_SCHEMA_NAME, INTERPRETATION_SYSTEM_PROMPT, toSearchFilters } from './interpretation-schema';
import { looksLikeNaturalLanguage, parseKeywordQuery } from './keyword-query-parser';

export interface SearchInterpreterOptions {
  readonly cacheSize: number;
  readonly cacheTtlSeconds: number;
  readonly timeoutMilliseconds: number;
}

export const SEARCH_INTERPRETER_OPTIONS = Symbol('SEARCH_INTERPRETER_OPTIONS');

const DEFAULT_OPTIONS: SearchInterpreterOptions = { cacheSize: 500, cacheTtlSeconds: 10 * 60, timeoutMilliseconds: 6_000 };
const MAXIMUM_QUERY_LENGTH = 200;

/**
 * Turns what the user typed into filters. Keyword-like queries never reach the model; sentences
 * get one structured-output call. Any failure falls back to keywords, so search never depends
 * on the model being up.
 */
@Injectable()
export class SearchQueryInterpreterService {
  private readonly logger = new Logger(SearchQueryInterpreterService.name);
  private readonly options: SearchInterpreterOptions;
  // Identical queries are common (shared links, refreshes), so successful parses are cached.
  private readonly cache = new Map<string, { readonly filters: SearchFilters; readonly expiresAtMilliseconds: number }>();
  // Concurrent identical queries share one model call instead of each paying for one.
  private readonly inFlight = new Map<string, Promise<InterpretedQuery>>();

  constructor(
    @Inject(ASSISTANT_LLM) private readonly llm: AssistantLlm,
    private readonly clock: Clock,
    @Optional() @Inject(SEARCH_INTERPRETER_OPTIONS) options?: Partial<SearchInterpreterOptions>,
  ) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  async interpret(query: string): Promise<InterpretedQuery> {
    const trimmed = query.trim().slice(0, MAXIMUM_QUERY_LENGTH);
    if (!trimmed) return { filters: EMPTY_SEARCH_FILTERS, interpretation: 'keywords' };
    if (!this.llm.isAvailable || !looksLikeNaturalLanguage(trimmed)) {
      return { filters: parseKeywordQuery(trimmed), interpretation: 'keywords' };
    }

    const key = trimmed.toLowerCase().replace(/\s+/g, ' ');
    const cached = this.cache.get(key);
    if (cached && cached.expiresAtMilliseconds > this.clock.now().getTime()) {
      return { filters: cached.filters, interpretation: 'model' };
    }
    const pending = this.inFlight.get(key);
    if (pending) return pending;

    const request = this.interpretWithModel(trimmed, key).finally(() => this.inFlight.delete(key));
    this.inFlight.set(key, request);
    return request;
  }

  private interpretWithModel(trimmed: string, key: string): Promise<InterpretedQuery> {
    return withSpan(
      'search.interpret_query',
      { 'gen_ai.system': this.llm.provider, 'gen_ai.request.model': this.llm.model },
      async (span) => {
        try {
          const { data, usage } = await withTimeout(
            this.llm.extract({
              system: INTERPRETATION_SYSTEM_PROMPT,
              user: trimmed,
              name: INTERPRETATION_SCHEMA_NAME,
              schema: INTERPRETATION_JSON_SCHEMA,
            }),
            this.options.timeoutMilliseconds,
          );
          const filters = toSearchFilters(data);
          this.remember(key, filters);
          span.setAttributes({
            'search.interpretation': 'model',
            'gen_ai.usage.input_tokens': usage.inputTokens,
            'gen_ai.usage.output_tokens': usage.outputTokens,
          });
          return { filters, interpretation: 'model' as const };
        } catch (error) {
          const reason = error instanceof Error ? error.message.slice(0, 120) : 'unknown';
          span.setAttributes({ 'search.interpretation': 'fallback', 'search.fallback_reason': reason });
          this.logger.warn(`Search interpretation fell back to keywords: ${reason}`);
          return { filters: parseKeywordQuery(trimmed), interpretation: 'fallback' as const };
        }
      },
    );
  }

  /** Re-inserting moves the key to the end, so the first key is always the least recently stored. */
  private remember(key: string, filters: SearchFilters): void {
    this.cache.delete(key);
    this.cache.set(key, { filters, expiresAtMilliseconds: this.clock.now().getTime() + this.options.cacheTtlSeconds * 1_000 });
    if (this.cache.size > this.options.cacheSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) this.cache.delete(oldestKey);
    }
  }
}

function withTimeout<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(`Timed out after ${milliseconds}ms`)), milliseconds);
    timer.unref();
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
