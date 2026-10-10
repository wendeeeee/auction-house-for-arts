import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { Pool } from 'pg';
import sharp from 'sharp';
import { Clock } from '../../src/common/clock';
import { seedCatalog } from '../../src/database/seed/seed-catalog';
import { ImageProcessingService, InMemoryBlobStorage, MAXIMUM_IMAGE_BYTE_SIZE } from '../../src/modules/images';
import { REALTIME_EMITTER } from '../../src/modules/realtime';
import { createJpegWithGpsExif } from '../fixtures/image-fixtures';
import { seedUserId } from '../support/auction-api';
import { CapturingRealtimeEmitter } from '../support/capturing-realtime-emitter';
import { createTestApp } from '../support/create-test-app';
import { FakeClock } from '../support/fake-clock';
import { createTestPool, prepareTestDatabase, truncateAllTables } from '../support/test-database';

const START = new Date('2026-02-01T09:00:00.000Z');
// Owned by amara_okafor in the seed.
const SLUG = 'harmattan-light';
const OWNER = 'amara_okafor';
const JPEG_UPLOAD = { contentType: 'image/jpeg', byteSize: 250_000 };

const asUser = (handle: string | null): Record<string, string> =>
  handle === null ? {} : { 'x-demo-user-id': seedUserId(handle) };

function imagesApi(app: NestFastifyApplication) {
  const base = (slug: string) => `/api/artworks/${slug}/images`;
  return {
    list: (handle: string | null, slug = SLUG) => app.inject({ method: 'GET', url: base(slug), headers: asUser(handle) }),
    requestUpload: (handle: string | null, body: unknown, slug = SLUG) =>
      app.inject({ method: 'POST', url: base(slug), headers: asUser(handle), payload: body as object }),
    complete: (handle: string | null, imageId: string, slug = SLUG) =>
      app.inject({ method: 'POST', url: `${base(slug)}/${imageId}/complete`, headers: asUser(handle) }),
    reorder: (handle: string | null, imageIds: readonly string[], slug = SLUG) =>
      app.inject({ method: 'PUT', url: `${base(slug)}/order`, headers: asUser(handle), payload: { imageIds } }),
    chooseCover: (handle: string | null, imageId: string, slug = SLUG) =>
      app.inject({ method: 'POST', url: `${base(slug)}/${imageId}/cover`, headers: asUser(handle) }),
    remove: (handle: string | null, imageId: string, slug = SLUG) =>
      app.inject({ method: 'DELETE', url: `${base(slug)}/${imageId}`, headers: asUser(handle) }),
    file: (url: string) => app.inject({ method: 'GET', url }),
  };
}

describe('artwork images API', () => {
  const clock = new FakeClock(START);
  const storage = new InMemoryBlobStorage();
  let app: NestFastifyApplication;
  let pool: Pool;
  let images: ReturnType<typeof imagesApi>;
  let processing: ImageProcessingService;

  beforeAll(async () => {
    await prepareTestDatabase();
    pool = createTestPool();
    app = await createTestApp({
      blobStorage: storage,
      configure: (builder) =>
        builder.overrideProvider(Clock).useValue(clock).overrideProvider(REALTIME_EMITTER).useValue(new CapturingRealtimeEmitter()),
    });
    images = imagesApi(app);
    processing = app.get(ImageProcessingService, { strict: false });
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  beforeEach(async () => {
    await truncateAllTables(pool);
    await seedCatalog(pool);
    clock.setTo(START);
    storage.clear();
  });

  /** Presign, "upload" the bytes as the browser would, and mark complete. Returns the image ID. */
  async function uploadImage(original?: Buffer): Promise<string> {
    const started = await images.requestUpload(OWNER, JPEG_UPLOAD);
    expect(started.statusCode).toBe(201);
    const imageId: string = started.json().image.id;
    await storage.put(storage.presignedPuts.at(-1)!.key, original ?? (await createJpegWithGpsExif(2_000, 1_500)), 'image/jpeg');
    expect((await images.complete(OWNER, imageId)).statusCode).toBe(200);
    return imageId;
  }

  async function uploadReadyImage(): Promise<string> {
    const imageId = await uploadImage();
    expect(await processing.processUploadedImage(imageId)).toBe('ready');
    return imageId;
  }

  const countImageRows = async () => Number((await pool.query<{ count: string }>('SELECT count(*) FROM artwork_images')).rows[0]!.count);

  describe('POST /artworks/:slug/images (presign)', () => {
    it('gives the owner a PUT URL for a new pending image, valid for 5 minutes', async () => {
      const response = await images.requestUpload(OWNER, JPEG_UPLOAD);

      expect(response.statusCode).toBe(201);
      expect(response.json()).toEqual({
        image: {
          id: expect.any(String),
          status: 'pending',
          rejectionReason: null,
          position: 0,
          isCover: false,
          small: null,
          large: null,
          createdAt: START.toISOString(),
        },
        upload: {
          method: 'PUT',
          url: expect.stringMatching(/^memory:\/\/blob-storage\/originals%2F/),
          headers: { 'Content-Type': 'image/jpeg' },
          expiresAt: '2026-02-01T09:05:00.000Z',
        },
      });
      expect(storage.presignedPuts).toEqual([
        { key: expect.stringMatching(/^originals\/[0-9a-f-]{36}$/), contentType: 'image/jpeg', byteSize: 250_000, expiresInSeconds: 300 },
      ]);
    });

    it('requires a user', async () => {
      const response = await images.requestUpload(null, JPEG_UPLOAD);
      expect(response.statusCode).toBe(401);
      expect(response.json().error.code).toBe('UNAUTHENTICATED');
    });

    it('refuses anyone but the artwork’s owner', async () => {
      const response = await images.requestUpload('ada_mensah', JPEG_UPLOAD);

      expect(response.statusCode).toBe(403);
      expect(response.json().error.code).toBe('NOT_ARTWORK_OWNER');
      expect(await countImageRows()).toBe(0);
    });

    it('answers ARTWORK_NOT_FOUND for an unknown artwork', async () => {
      const response = await images.requestUpload(OWNER, JPEG_UPLOAD, 'no-such-artwork');
      expect(response.statusCode).toBe(404);
      expect(response.json().error.code).toBe('ARTWORK_NOT_FOUND');
    });

    it.each(['image/gif', 'image/svg+xml', 'application/pdf'])('refuses the type %s', async (contentType) => {
      const response = await images.requestUpload(OWNER, { contentType, byteSize: 1_000 });

      expect(response.statusCode).toBe(400);
      expect(response.json().error.details.fieldErrors).toEqual([expect.objectContaining({ path: 'contentType' })]);
    });

    it('accepts exactly 15 MB and refuses one byte more, or an empty file', async () => {
      expect((await images.requestUpload(OWNER, { contentType: 'image/png', byteSize: MAXIMUM_IMAGE_BYTE_SIZE })).statusCode).toBe(201);
      for (const byteSize of [MAXIMUM_IMAGE_BYTE_SIZE + 1, 0]) {
        const response = await images.requestUpload(OWNER, { contentType: 'image/png', byteSize });
        expect(response.statusCode).toBe(400);
        expect(response.json().error.details.fieldErrors).toEqual([expect.objectContaining({ path: 'byteSize' })]);
      }
    });

    it('allows 8 images per artwork, and not counting rejected ones', async () => {
      for (let count = 0; count < 8; count += 1) {
        expect((await images.requestUpload(OWNER, JPEG_UPLOAD)).statusCode).toBe(201);
      }

      const ninth = await images.requestUpload(OWNER, JPEG_UPLOAD);
      expect(ninth.statusCode).toBe(409);
      expect(ninth.json().error).toMatchObject({ code: 'IMAGE_LIMIT_REACHED', details: { maximumImages: 8 } });

      await pool.query(
        `UPDATE artwork_images SET status = 'rejected', rejection_reason = 'not_an_image', completed_at = now(), processed_at = now()
          WHERE id = (SELECT id FROM artwork_images ORDER BY position LIMIT 1)`,
      );
      expect((await images.requestUpload(OWNER, JPEG_UPLOAD)).statusCode).toBe(201);
    });
  });

  describe('POST /artworks/:slug/images/:id/complete', () => {
    const loadEvents = async () =>
      (await pool.query<{ type: string; payload: unknown }>('SELECT type, payload FROM outbox_events ORDER BY occurred_at')).rows;

    it('queues processing through the outbox exactly once, however often it is called', async () => {
      const started = await images.requestUpload(OWNER, JPEG_UPLOAD);
      const imageId: string = started.json().image.id;

      const first = await images.complete(OWNER, imageId);
      const second = await images.complete(OWNER, imageId);

      expect(first.statusCode).toBe(200);
      expect(first.json()).toMatchObject({ id: imageId, status: 'processing' });
      expect(second.json()).toMatchObject({ id: imageId, status: 'processing' });
      const artworkId = (await pool.query<{ id: string }>('SELECT id FROM artworks WHERE slug = $1', [SLUG])).rows[0]!.id;
      expect(await loadEvents()).toEqual([{ type: 'ImageUploaded', payload: { imageId, artworkId } }]);
    });

    it('refuses anyone but the owner', async () => {
      const imageId: string = (await images.requestUpload(OWNER, JPEG_UPLOAD)).json().image.id;

      const response = await images.complete('ada_mensah', imageId);

      expect(response.statusCode).toBe(403);
      expect(await loadEvents()).toEqual([]);
    });

    it('does not find an image through another artwork’s slug', async () => {
      const imageId: string = (await images.requestUpload(OWNER, JPEG_UPLOAD)).json().image.id;

      // Also Amara's, so ownership passes and only the image lookup can refuse.
      const response = await images.complete(OWNER, imageId, 'study-of-hands');

      expect(response.statusCode).toBe(404);
      expect(response.json().error.code).toBe('IMAGE_NOT_FOUND');
    });
  });

  describe('serving', () => {
    it('includes processed images in the artwork, and the cover on catalog cards', async () => {
      const imageId = await uploadReadyImage();
      const expectedImage = {
        id: imageId,
        isCover: true,
        small: { url: `/api/artwork-images/${imageId}/small`, width: 400, height: 300 },
        large: { url: `/api/artwork-images/${imageId}/large`, width: 1_600, height: 1_200 },
      };

      const detail = (await app.inject({ method: 'GET', url: `/api/artworks/${SLUG}` })).json();
      expect(detail.images).toEqual([expectedImage]);
      expect(detail.coverImage).toEqual(expectedImage);

      const { items } = (await app.inject({ method: 'GET', url: '/api/artworks' })).json();
      expect(items.find((item: { slug: string }) => item.slug === SLUG).coverImage).toEqual(expectedImage);
      expect(items.find((item: { slug: string }) => item.slug === 'lagos-at-dusk').coverImage).toBeNull();
    });

    it('serves a processed version as cacheable WebP', async () => {
      const imageId = await uploadReadyImage();

      const response = await images.file(`/api/artwork-images/${imageId}/small`);

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-type']).toBe('image/webp');
      expect(response.headers['cache-control']).toBe('public, max-age=31536000, immutable');
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(await sharp(response.rawPayload).metadata()).toMatchObject({ format: 'webp', width: 400 });
    });

    it('never serves an image that is not processed, nor any original', async () => {
      const imageId = await uploadImage();

      for (const variant of ['small', 'large', 'original']) {
        const response = await images.file(`/api/artwork-images/${imageId}/${variant}`);
        expect(response.statusCode).toBe(variant === 'original' ? 400 : 404);
      }
      expect((await app.inject({ method: 'GET', url: `/api/artworks/${SLUG}` })).json().images).toEqual([]);
    });

    it('shows the owner every image with its status and rejection reason', async () => {
      const readyId = await uploadReadyImage();
      const rejectedId = await uploadImage(Buffer.from('not an image'));
      await processing.processUploadedImage(rejectedId);

      const response = await images.list(OWNER);

      expect(response.statusCode).toBe(200);
      expect(response.json().items).toEqual([
        expect.objectContaining({ id: readyId, status: 'ready', isCover: true, rejectionReason: null }),
        expect.objectContaining({ id: rejectedId, status: 'rejected', isCover: false, rejectionReason: 'not_an_image', small: null }),
      ]);
      expect((await images.list('ada_mensah')).statusCode).toBe(403);
    });
  });

  describe('managing images', () => {
    it('makes a processed image the cover, and refuses one still processing', async () => {
      const firstId = await uploadReadyImage();
      const secondId = await uploadReadyImage();
      const processingId = await uploadImage();

      const chosen = await images.chooseCover(OWNER, secondId);
      expect(chosen.statusCode).toBe(200);
      expect(chosen.json().items.map((image: { id: string; isCover: boolean }) => [image.id, image.isCover])).toEqual([
        [firstId, false],
        [secondId, true],
        [processingId, false],
      ]);
      expect((await app.inject({ method: 'GET', url: `/api/artworks/${SLUG}` })).json().coverImage.id).toBe(secondId);

      const refused = await images.chooseCover(OWNER, processingId);
      expect(refused.statusCode).toBe(409);
      expect(refused.json().error.code).toBe('IMAGE_NOT_READY');
    });

    it('reorders the gallery when every image is listed once', async () => {
      const firstId = await uploadReadyImage();
      const secondId = await uploadReadyImage();
      const thirdId = await uploadImage();

      const response = await images.reorder(OWNER, [thirdId, firstId, secondId]);

      expect(response.statusCode).toBe(200);
      expect(response.json().items.map((image: { id: string; position: number }) => [image.id, image.position])).toEqual([
        [thirdId, 0],
        [firstId, 1],
        [secondId, 2],
      ]);
      expect((await app.inject({ method: 'GET', url: `/api/artworks/${SLUG}` })).json().images.map((image: { id: string }) => image.id)).toEqual([
        firstId,
        secondId,
      ]);
    });

    it('refuses an order that leaves an image out', async () => {
      const firstId = await uploadReadyImage();
      const secondId = await uploadReadyImage();

      const response = await images.reorder(OWNER, [secondId]);

      expect(response.statusCode).toBe(409);
      expect(response.json().error).toMatchObject({ code: 'INVALID_IMAGE_ORDER', details: { reason: 'missing', imageIds: [firstId] } });
    });

    it('deletes an image’s row and every stored object', async () => {
      const keptId = await uploadReadyImage();
      const deletedId = await uploadReadyImage();
      expect(storage.keys().filter((key) => key.includes(deletedId))).toHaveLength(2);

      const response = await images.remove(OWNER, deletedId);

      expect(response.statusCode).toBe(204);
      expect((await pool.query('SELECT id FROM artwork_images WHERE id = $1', [deletedId])).rows).toEqual([]);
      expect((await pool.query('SELECT image_id FROM artwork_image_variants WHERE image_id = $1', [deletedId])).rows).toEqual([]);
      expect(storage.keys().filter((key) => key.includes(deletedId))).toEqual([]);
      expect(storage.keys().filter((key) => key.includes(keptId))).toHaveLength(2);
      expect((await images.file(`/api/artwork-images/${deletedId}/small`)).statusCode).toBe(404);
    });

    it('deletes a pending upload’s original too', async () => {
      const imageId: string = (await images.requestUpload(OWNER, JPEG_UPLOAD)).json().image.id;
      const originalKey = storage.presignedPuts.at(-1)!.key;
      await storage.put(originalKey, Buffer.from('partial'), 'image/jpeg');

      expect((await images.remove(OWNER, imageId)).statusCode).toBe(204);

      expect(await storage.get(originalKey)).toBeNull();
      expect(await countImageRows()).toBe(0);
    });

    it('refuses deletion by anyone but the owner', async () => {
      const imageId = await uploadReadyImage();

      expect((await images.remove('ada_mensah', imageId)).statusCode).toBe(403);
      expect(await countImageRows()).toBe(1);
    });
  });
});
