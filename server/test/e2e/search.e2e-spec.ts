import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { Pool } from 'pg';
import { Clock } from '../../src/common/clock';
import { seedCatalog } from '../../src/database/seed/seed-catalog';
import { ASSISTANT_LLM, ExtractRequest, ScriptedAssistantLlm } from '../../src/modules/language-models';
import { auctionApi } from '../support/auction-api';
import { createTestApp } from '../support/create-test-app';
import { FakeClock } from '../support/fake-clock';
import { createTestPool, prepareTestDatabase, truncateAllTables } from '../support/test-database';

const START = new Date('2026-01-15T12:00:00.000Z');
const HOUR_SECONDS = 3_600;
const DAY_SECONDS = 24 * HOUR_SECONDS;
const inSeconds = (seconds: number): string => new Date(START.getTime() + seconds * 1_000).toISOString();

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

interface SearchBody {
  query: string;
  interpretation: string;
  filters: Record<string, unknown>;
  items: { slug: string; artwork: { slug: string }; priceCents: number }[];
}

describe('search API', () => {
  let app: NestFastifyApplication;
  let pool: Pool;
  const clock = new FakeClock(START);
  // Each test sets what the fake model answers; queries differ per test, so the interpreter's cache never hides a call.
  let extraction: (request: ExtractRequest) => unknown = () => NOTHING;
  const llm = new ScriptedAssistantLlm([], (request) => extraction(request));

  beforeAll(async () => {
    await prepareTestDatabase();
    pool = createTestPool();
    await truncateAllTables(pool);
    await seedCatalog(pool);
    app = await createTestApp({
      configure: (builder) => builder.overrideProvider(Clock).useValue(clock).overrideProvider(ASSISTANT_LLM).useValue(llm),
    });

    clock.setTo(START);
    const api = auctionApi(app);
    const auctions: [string, string, number, number][] = [
      ['amara_okafor', 'harmattan-light', 1_000_00, 2 * DAY_SECONDS],
      ['bianca_rossi', 'lagos-at-dusk', 8_000_00, 3 * DAY_SECONDS],
      ['rafael_ortiz', 'desert-geometry', 2_000_00, 10 * DAY_SECONDS],
      ['mei_tanaka', 'tide-vessel', 4_000_00, 5 * DAY_SECONDS],
      ['tomas_lindqvist', 'birch-woodcut-no-3', 300_00, HOUR_SECONDS],
    ];
    for (const [sellerHandle, artworkSlug, startingPriceCents, endsInSeconds] of auctions) {
      const response = await api.create(sellerHandle, { artworkSlug, startingPriceCents, endsAt: inSeconds(endsInSeconds) });
      expect(response.statusCode).toBe(201);
    }
    // The woodcut has ended (not yet closed); everything else is open.
    clock.setTo(new Date(START.getTime() + 2 * HOUR_SECONDS * 1_000));
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  async function search(query: Record<string, string>): Promise<SearchBody> {
    const response = await app.inject({ method: 'GET', url: `/api/search?${new URLSearchParams(query).toString()}` });
    expect(response.statusCode).toBe(200);
    return response.json() as SearchBody;
  }

  const artworkSlugs = (body: SearchBody): string[] => body.items.map((item) => item.artwork.slug);

  it('runs a keyword query without calling the model', async () => {
    const before = llm.extractions.length;
    const body = await search({ q: 'harmattan' });
    expect(body.interpretation).toBe('keywords');
    expect(artworkSlugs(body)).toEqual(['harmattan-light']);
    expect(llm.extractions).toHaveLength(before);
  });

  it('matches keywords against the artist’s name and the description', async () => {
    expect(artworkSlugs(await search({ q: 'okafor' }))).toEqual(['harmattan-light', 'lagos-at-dusk']);
    expect(artworkSlugs(await search({ q: 'celadon' }))).toEqual(['tide-vessel']);
  });

  it('turns a sentence into filters with one structured call', async () => {
    extraction = () => ({ ...NOTHING, keywords: ['oil'], medium: 'Painting', status: 'open', maxPriceDollars: 5_000, endingWithinHours: 168 });
    const body = await search({ q: 'Open oil paintings under $5k ending this week' });
    expect(body.interpretation).toBe('model');
    expect(body.filters).toEqual({
      keywords: ['oil'],
      medium: 'Painting',
      artist: null,
      status: 'open',
      minPriceCents: null,
      maxPriceCents: 500_000,
      endingWithinHours: 168,
      sort: 'ending_soon',
    });
    // Lagos at Dusk is over budget; Desert Geometry is acrylic and ends in 10 days.
    expect(artworkSlugs(body)).toEqual(['harmattan-light']);
  });

  it('falls back to keywords when the model fails', async () => {
    extraction = () => {
      throw new Error('model down');
    };
    const body = await search({ q: 'show me open oil paintings under 5k please' });
    expect(body.interpretation).toBe('fallback');
    expect(body.filters).toMatchObject({ keywords: ['oil'], medium: 'Painting', status: 'open', maxPriceCents: 500_000 });
    expect(artworkSlugs(body)).toEqual(['harmattan-light']);
  });

  it('never interprets the text in filters mode', async () => {
    const before = llm.extractions.length;
    const body = await search({ q: 'anything at all for my hallway please', mode: 'filters', medium: 'Print', status: 'ended' });
    expect(body.interpretation).toBe('explicit');
    expect(artworkSlugs(body)).toEqual(['birch-woodcut-no-3']);
    expect(llm.extractions).toHaveLength(before);
  });

  it('lets explicit filters override the interpretation', async () => {
    const body = await search({ q: 'paintings', sort: 'price_high' });
    expect(body.filters).toMatchObject({ medium: 'Painting', sort: 'price_high' });
    expect(body.items.map((item) => item.priceCents)).toEqual([8_000_00, 2_000_00, 1_000_00]);
  });

  it('filters by artist name, slug, or the artist’s user handle', async () => {
    const byHandle = await search({ mode: 'filters', artist: '@mei_tanaka' });
    expect(artworkSlugs(byHandle)).toEqual(['tide-vessel']);
    expect(artworkSlugs(await search({ mode: 'filters', artist: 'rafael-ortiz' }))).toEqual(['desert-geometry']);
    expect(artworkSlugs(await search({ mode: 'filters', artist: 'Lindqvist' }))).toEqual(['birch-woodcut-no-3']);
  });

  it('filters by a price range in whole dollars', async () => {
    const body = await search({ mode: 'filters', minPrice: '1500', maxPrice: '5000', sort: 'price_low' });
    expect(artworkSlugs(body)).toEqual(['desert-geometry', 'tide-vessel']);
  });

  it('rejects invalid filter values with field errors', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/search?status=sometimes&minPrice=-1' });
    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe('VALIDATION_FAILED');
  });
});
