import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { Pool } from 'pg';
import { seedCatalog } from '../../src/database/seed/seed-catalog';
import { createTestApp } from '../support/create-test-app';
import { createTestPool, prepareTestDatabase, truncateAllTables } from '../support/test-database';

describe('catalog API', () => {
  let app: NestFastifyApplication;
  let pool: Pool;

  beforeAll(async () => {
    await prepareTestDatabase();
    pool = createTestPool();
    await truncateAllTables(pool);
    await seedCatalog(pool);
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  async function listSlugs(queryString: string): Promise<string[]> {
    const response = await app.inject({ method: 'GET', url: `/api/artworks${queryString}` });
    expect(response.statusCode).toBe(200);
    return response.json().items.map((item: { slug: string }) => item.slug);
  }

  describe('GET /api/artworks', () => {
    it('lists the whole seeded catalog, newest first, as summaries', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/artworks' });

      expect(response.statusCode).toBe(200);
      const { items } = response.json();
      expect(items).toHaveLength(16);
      expect(items[0]).toEqual({
        slug: 'harmattan-light',
        title: 'Harmattan Light',
        year: 2023,
        medium: 'Painting',
        dimensions: '120 × 90 cm',
        artist: { slug: 'amara-okafor', name: 'Amara Okafor' },
        saleType: 'primary',
        coverImage: null,
      });
    });

    it('marks collector-owned works as resales', async () => {
      const { items } = (await app.inject({ method: 'GET', url: '/api/artworks?query=frozen' })).json();
      expect(items).toEqual([expect.objectContaining({ slug: 'frozen-harbour', saleType: 'resale' })]);
    });

    it('filters by medium', async () => {
      expect(await listSlugs('?medium=Sculpture')).toEqual(['tide-vessel', 'quiet-bronze']);
    });

    it('filters by artist slug', async () => {
      expect(await listSlugs('?artist=mei-tanaka')).toEqual([
        'tide-vessel',
        'quiet-bronze',
        'signal-garden',
        'paper-cranes-in-motion',
      ]);
    });

    it('returns an empty list for an artist who does not exist', async () => {
      expect(await listSlugs('?artist=nobody-at-all')).toEqual([]);
    });

    it('searches titles and artist names', async () => {
      expect(await listSlugs('?query=harbour')).toEqual(['frozen-harbour']);
      expect(await listSlugs('?query=LINDQVIST')).toEqual([
        'northern-silence',
        'frozen-harbour',
        'birch-woodcut-no-3',
        'lighthouse-etching',
      ]);
    });

    it('combines filters', async () => {
      expect(await listSlugs('?artist=tomas-lindqvist&medium=Print')).toEqual(['birch-woodcut-no-3', 'lighthouse-etching']);
    });

    it('treats blank parameters as absent', async () => {
      expect(await listSlugs('?query=&medium=&artist=')).toHaveLength(16);
    });

    it('rejects an unknown medium with VALIDATION_FAILED and the offending field', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/artworks?medium=Fresco&limit=0' });

      expect(response.statusCode).toBe(400);
      const { error } = response.json();
      expect(error.code).toBe('VALIDATION_FAILED');
      expect(error.details.fieldErrors.map((fieldError: { path: string }) => fieldError.path)).toEqual(['medium', 'limit']);
    });
  });

  describe('GET /api/artworks/:slug', () => {
    it('returns the detail, including the artist profile', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/artworks/lagos-at-dusk' });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({
        slug: 'lagos-at-dusk',
        title: 'Lagos at Dusk',
        year: 2021,
        medium: 'Painting',
        dimensions: '100 × 150 cm',
        description: 'Oil on canvas. The lagoon bridge as traffic lights come on.',
        ownerUserId: '5eed0000-0000-4000-8000-000000000006',
        saleType: 'resale',
        artist: {
          slug: 'amara-okafor',
          name: 'Amara Okafor',
          bio: expect.any(String),
          royaltyBps: 500,
        },
        coverImage: null,
        images: [],
      });
    });

    it('answers ARTWORK_NOT_FOUND in the error contract, with the request correlation ID', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/artworks/no-such-artwork',
        headers: { 'x-request-id': 'catalog-miss-0001' },
      });

      expect(response.statusCode).toBe(404);
      expect(response.headers['x-request-id']).toBe('catalog-miss-0001');
      expect(response.json()).toEqual({
        error: {
          code: 'ARTWORK_NOT_FOUND',
          message: 'No artwork with slug "no-such-artwork".',
          details: { slug: 'no-such-artwork' },
          correlationId: 'catalog-miss-0001',
        },
      });
    });
  });

  it('lists artists for the catalog filter', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/artists' });

    expect(response.statusCode).toBe(200);
    expect(response.json().items.map((artist: { slug: string }) => artist.slug)).toEqual([
      'amara-okafor',
      'mei-tanaka',
      'rafael-ortiz',
      'tomas-lindqvist',
    ]);
  });
});
