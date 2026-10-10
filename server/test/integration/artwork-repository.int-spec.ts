import type { Pool } from 'pg';
import { UnitOfWork } from '../../src/database';
import { ArtistRepository } from '../../src/modules/artists/artist.repository';
import { ArtworkRepository } from '../../src/modules/artworks/artwork.repository';
import { insertArtist, insertArtwork } from '../support/catalog-fixtures';
import { createTestPool, prepareTestDatabase, truncateAllTables } from '../support/test-database';

describe('ArtworkRepository', () => {
  let pool: Pool;
  let artworkRepository: ArtworkRepository;
  let artistRepository: ArtistRepository;

  let okaforId: string;
  let lindqvistId: string;

  beforeAll(async () => {
    await prepareTestDatabase();
    pool = createTestPool();
    const unitOfWork = new UnitOfWork(pool);
    artworkRepository = new ArtworkRepository(unitOfWork);
    artistRepository = new ArtistRepository(unitOfWork);
  });

  afterAll(async () => {
    await pool.end();
  });

  beforeEach(async () => {
    await truncateAllTables(pool);
    const okafor = await insertArtist(pool, { slug: 'amara-okafor', name: 'Amara Okafor' });
    const lindqvist = await insertArtist(pool, { slug: 'tomas-lindqvist', name: 'Tomás Lindqvist' });
    okaforId = okafor.artistId;
    lindqvistId = lindqvist.artistId;

    const at = (minute: number) => new Date(Date.UTC(2026, 0, 1, 0, minute));
    await insertArtwork(pool, { slug: 'harmattan-light', title: 'Harmattan Light', medium: 'Painting', artistId: okaforId, ownerUserId: okafor.userId, createdAt: at(1) });
    await insertArtwork(pool, { slug: 'study-of-hands', title: 'Study of Hands', medium: 'Drawing', artistId: okaforId, ownerUserId: okafor.userId, createdAt: at(2) });
    await insertArtwork(pool, { slug: 'frozen-harbour', title: 'Frozen Harbour', medium: 'Photography', artistId: lindqvistId, ownerUserId: lindqvist.userId, createdAt: at(3) });
    await insertArtwork(pool, { slug: 'harbour-at-100', title: 'Harbour at 100% Fog', medium: 'Print', artistId: lindqvistId, ownerUserId: lindqvist.userId, createdAt: at(4) });
    await insertArtwork(pool, { slug: 'snake-case', title: 'Lines_and_Underscores', medium: 'Print', artistId: lindqvistId, ownerUserId: lindqvist.userId, createdAt: at(5) });
  });

  async function slugsFor(filter: Parameters<ArtworkRepository['list']>[0]): Promise<string[]> {
    return (await artworkRepository.list(filter)).map((artwork) => artwork.slug);
  }

  it('lists everything newest first without filters', async () => {
    expect(await slugsFor({ limit: 50 })).toEqual([
      'snake-case',
      'harbour-at-100',
      'frozen-harbour',
      'study-of-hands',
      'harmattan-light',
    ]);
  });

  it('maps rows to domain artworks', async () => {
    const [artwork] = await artworkRepository.list({ medium: 'Drawing', limit: 50 });
    expect(artwork).toEqual({
      id: expect.any(String),
      slug: 'study-of-hands',
      artistId: okaforId,
      title: 'Study of Hands',
      year: null,
      medium: 'Drawing',
      dimensions: '10 × 10 cm',
      description: '',
      ownerUserId: expect.any(String),
      createdAt: new Date(Date.UTC(2026, 0, 1, 0, 2)),
    });
  });

  it('filters by medium', async () => {
    expect(await slugsFor({ medium: 'Print', limit: 50 })).toEqual(['snake-case', 'harbour-at-100']);
  });

  it('filters by artist', async () => {
    expect(await slugsFor({ artistId: okaforId, limit: 50 })).toEqual(['study-of-hands', 'harmattan-light']);
  });

  it('matches a title substring case-insensitively', async () => {
    expect(await slugsFor({ searchText: 'HARBOUR', limit: 50 })).toEqual(['harbour-at-100', 'frozen-harbour']);
  });

  it('also matches works by the artists whose name matched', async () => {
    const artistIds = await artistRepository.findIdsByNameContaining('okafor');
    expect(await slugsFor({ searchText: 'okafor', artistIdsMatchingSearch: artistIds, limit: 50 })).toEqual([
      'study-of-hands',
      'harmattan-light',
    ]);
  });

  it('combines filters with AND', async () => {
    expect(await slugsFor({ searchText: 'harbour', medium: 'Photography', limit: 50 })).toEqual(['frozen-harbour']);
    expect(await slugsFor({ searchText: 'harbour', artistId: okaforId, limit: 50 })).toEqual([]);
  });

  it.each([
    ['%', ['harbour-at-100']],
    ['_', ['snake-case']],
    ['100%', ['harbour-at-100']],
  ])('treats %p in the search text literally, not as a wildcard', async (searchText, expected) => {
    expect(await slugsFor({ searchText, limit: 50 })).toEqual(expected);
  });

  it('respects the limit', async () => {
    expect(await slugsFor({ limit: 2 })).toEqual(['snake-case', 'harbour-at-100']);
  });

  it('finds one artwork by slug, or null', async () => {
    expect((await artworkRepository.findBySlug('frozen-harbour'))?.title).toBe('Frozen Harbour');
    expect(await artworkRepository.findBySlug('does-not-exist')).toBeNull();
  });
});
