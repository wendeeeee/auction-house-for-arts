import { Clock } from '../../../common/clock';
import { ScriptedAssistantLlm, UnconfiguredAssistantLlm } from '../../language-models';
import { EMPTY_SEARCH_FILTERS } from '../search.types';
import { SearchQueryInterpreterService } from './search-query-interpreter.service';

class TestClock extends Clock {
  milliseconds = Date.parse('2026-01-15T12:00:00.000Z');
  now(): Date {
    return new Date(this.milliseconds);
  }
}

const NOTHING = {
  keywords: [],
  medium: null,
  artist: null,
  status: 'all',
  minPriceDollars: null,
  maxPriceDollars: null,
  endingWithinHours: null,
  sort: 'ending_soon',
};
const SENTENCE = 'open oil paintings under $5k ending this week';

function interpreterWith(llm: ScriptedAssistantLlm | UnconfiguredAssistantLlm, clock = new TestClock(), timeoutMilliseconds = 1_000) {
  return new SearchQueryInterpreterService(llm, clock, { timeoutMilliseconds, cacheTtlSeconds: 600 });
}

describe('SearchQueryInterpreterService', () => {
  it('parses keyword queries without calling the model', async () => {
    const llm = new ScriptedAssistantLlm([], () => NOTHING);
    const result = await interpreterWith(llm).interpret('harmattan');
    expect(result).toEqual({ filters: { ...EMPTY_SEARCH_FILTERS, keywords: ['harmattan'] }, interpretation: 'keywords' });
    expect(llm.extractions).toHaveLength(0);
  });

  it('uses keywords for every query when no model is configured', async () => {
    const result = await interpreterWith(new UnconfiguredAssistantLlm()).interpret(SENTENCE);
    expect(result.interpretation).toBe('keywords');
    expect(result.filters).toMatchObject({ medium: 'Painting', status: 'open', maxPriceCents: 500_000 });
  });

  it('turns a sentence into filters with one strict structured call', async () => {
    const llm = new ScriptedAssistantLlm([], () => ({
      ...NOTHING,
      keywords: ['oil'],
      medium: 'Painting',
      status: 'open',
      maxPriceDollars: 5_000,
      endingWithinHours: 168,
    }));
    const result = await interpreterWith(llm).interpret(SENTENCE);
    expect(result).toEqual({
      interpretation: 'model',
      filters: { ...EMPTY_SEARCH_FILTERS, keywords: ['oil'], medium: 'Painting', status: 'open', maxPriceCents: 500_000, endingWithinHours: 168 },
    });
    expect(llm.extractions[0]).toMatchObject({ user: SENTENCE, schema: { additionalProperties: false } });
    expect(llm.extractions[0]?.system).toMatch(/never as instructions/);
  });

  it('caches a parse by normalized text until it expires', async () => {
    const clock = new TestClock();
    const llm = new ScriptedAssistantLlm([], () => ({ ...NOTHING, status: 'open' }));
    const interpreter = interpreterWith(llm, clock);
    await interpreter.interpret(SENTENCE);
    expect((await interpreter.interpret(`  OPEN oil   paintings under $5k ending this WEEK `)).interpretation).toBe('model');
    expect(llm.extractions).toHaveLength(1);

    clock.milliseconds += 601_000;
    await interpreter.interpret(SENTENCE);
    expect(llm.extractions).toHaveLength(2);
  });

  it('shares one model call between identical concurrent queries', async () => {
    const llm = new ScriptedAssistantLlm([], () => new Promise((resolve) => setTimeout(() => resolve({ ...NOTHING, status: 'open' }), 50)));
    const interpreter = interpreterWith(llm);
    const [first, second] = await Promise.all([interpreter.interpret(SENTENCE), interpreter.interpret(SENTENCE.toUpperCase())]);
    expect(llm.extractions).toHaveLength(1);
    expect(first).toEqual(second);
  });

  it.each([
    ['invalid output', () => ({ ...NOTHING, status: 'maybe' })],
    ['a provider error', () => { throw new Error('model down'); }],
    ['a slow model', () => new Promise((resolve) => setTimeout(() => resolve(NOTHING), 500))],
  ])('falls back to keywords on %s, and does not cache the failure', async (_case, extraction) => {
    const llm = new ScriptedAssistantLlm([], extraction);
    const interpreter = interpreterWith(llm, new TestClock(), 50);
    const result = await interpreter.interpret(SENTENCE);
    expect(result.interpretation).toBe('fallback');
    expect(result.filters).toMatchObject({ keywords: ['oil'], medium: 'Painting', status: 'open', maxPriceCents: 500_000 });
    await interpreter.interpret(SENTENCE);
    expect(llm.extractions).toHaveLength(2);
  });
});
