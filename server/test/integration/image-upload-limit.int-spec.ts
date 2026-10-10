import type { TestingModule } from '@nestjs/testing';
import type { Pool } from 'pg';
import { ImageLimitReachedError, ImageUploadService, ImagesModule, MAXIMUM_IMAGES_PER_ARTWORK } from '../../src/modules/images';
import { insertArtist, insertArtwork } from '../support/catalog-fixtures';
import { createTestContext } from '../support/create-test-context';
import { createTestPool, prepareTestDatabase, truncateAllTables } from '../support/test-database';

describe('per-artwork image limit under concurrency', () => {
  let pool: Pool;
  let context: TestingModule;
  let uploads: ImageUploadService;
  let artworkId: string;
  let ownerUserId: string;

  beforeAll(async () => {
    await prepareTestDatabase();
    pool = createTestPool();
    context = await createTestContext({ imports: [ImagesModule] });
    uploads = context.get(ImageUploadService, { strict: false });
  });

  afterAll(async () => {
    await context.close();
    await pool.end();
  });

  beforeEach(async () => {
    await truncateAllTables(pool);
    const artist = await insertArtist(pool);
    ownerUserId = artist.userId;
    artworkId = await insertArtwork(pool, { artistId: artist.artistId, ownerUserId });
  });

  const requestUpload = () => uploads.requestUpload({ artworkId, uploadedByUserId: ownerUserId, contentType: 'image/jpeg', byteSize: 1_000 });

  it('lets exactly one of eight simultaneous requests take the last slot', async () => {
    for (let count = 0; count < MAXIMUM_IMAGES_PER_ARTWORK - 1; count += 1) await requestUpload();

    const results = await Promise.allSettled(Array.from({ length: 8 }, () => requestUpload()));

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    const failures = results.flatMap((result) => (result.status === 'rejected' ? [result.reason] : []));
    expect(failures).toHaveLength(7);
    expect(failures.every((reason) => reason instanceof ImageLimitReachedError)).toBe(true);

    const { rows } = await pool.query<{ position: number }>('SELECT position FROM artwork_images WHERE artwork_id = $1 ORDER BY position', [
      artworkId,
    ]);
    expect(rows.map((row) => row.position)).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
  });
});
