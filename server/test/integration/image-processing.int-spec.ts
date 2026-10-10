import { randomUUID } from 'node:crypto';
import type { TestingModule } from '@nestjs/testing';
import type { Pool } from 'pg';
import sharp from 'sharp';
import { Clock } from '../../src/common/clock';
import { DEFAULT_MESSAGING_TOPOLOGY, RabbitMqConnection } from '../../src/common/messaging';
import {
  ImageProcessingConsumer,
  ImageProcessingService,
  ImagesModule,
  InMemoryBlobStorage,
  variantStorageKey,
} from '../../src/modules/images';
import { SVG_DOCUMENT, TEXT_FILE_NAMED_JPG, createJpegWithGpsExif, createOversizedPng } from '../fixtures/image-fixtures';
import { insertProcessingImage } from '../support/artwork-image-fixtures';
import { insertArtist, insertArtwork } from '../support/catalog-fixtures';
import { createTestContext } from '../support/create-test-context';
import { FakeClock } from '../support/fake-clock';
import { createTestPool, prepareTestDatabase, truncateAllTables } from '../support/test-database';

/** Runs `beforePut` once, just before the first variant is stored. */
class InterruptingBlobStorage extends InMemoryBlobStorage {
  beforePut: (() => Promise<void>) | null = null;

  override async put(key: string, body: Buffer, contentType: string): Promise<void> {
    const hook = key.startsWith('variants/') ? this.beforePut : null;
    this.beforePut = null;
    if (hook) await hook();
    await super.put(key, body, contentType);
  }
}

describe('image processing worker', () => {
  const clock = new FakeClock(new Date('2026-03-01T10:00:00.000Z'));
  const storage = new InterruptingBlobStorage();
  let pool: Pool;
  let context: TestingModule;
  let service: ImageProcessingService;
  let artworkId: string;
  let ownerUserId: string;

  beforeAll(async () => {
    await prepareTestDatabase();
    pool = createTestPool();
    context = await createTestContext({
      imports: [ImagesModule],
      blobStorage: storage,
      configure: (builder) => builder.overrideProvider(Clock).useValue(clock),
    });
    service = context.get(ImageProcessingService, { strict: false });
  });

  afterAll(async () => {
    await context.close();
    await pool.end();
  });

  beforeEach(async () => {
    await truncateAllTables(pool);
    storage.clear();
    storage.beforePut = null;
    const artist = await insertArtist(pool);
    ownerUserId = artist.userId;
    artworkId = await insertArtwork(pool, { artistId: artist.artistId, ownerUserId });
  });

  const addImage = (original: Buffer, declaredContentType: 'image/jpeg' | 'image/png' = 'image/jpeg') =>
    insertProcessingImage(pool, storage, { artworkId, uploadedByUserId: ownerUserId, original, declaredContentType });

  const loadImage = async (imageId: string) =>
    (
      await pool.query<{ status: string; rejection_reason: string | null }>(
        'SELECT status, rejection_reason FROM artwork_images WHERE id = $1',
        [imageId],
      )
    ).rows[0];

  const loadVariants = async (imageId: string) =>
    (
      await pool.query<{ variant: string; width: number; height: number }>(
        'SELECT variant, width, height FROM artwork_image_variants WHERE image_id = $1 ORDER BY width, variant',
        [imageId],
      )
    ).rows;

  it('turns a valid JPEG into 400px and 1,600px WebP versions with its metadata stripped', async () => {
    const original = await createJpegWithGpsExif(2_400, 1_800);
    expect((await sharp(original).metadata()).exif).toBeDefined();
    const { imageId, originalStorageKey } = await addImage(original);

    expect(await service.processUploadedImage(imageId)).toBe('ready');

    expect(await loadImage(imageId)).toEqual({ status: 'ready', rejection_reason: null });
    expect(await loadVariants(imageId)).toEqual([
      { variant: 'small', width: 400, height: 300 },
      { variant: 'large', width: 1_600, height: 1_200 },
    ]);
    for (const variant of ['small', 'large'] as const) {
      const stored = await storage.get(variantStorageKey(imageId, variant));
      const metadata = await sharp(stored!.body).metadata();
      expect(metadata.format).toBe('webp');
      expect(metadata.exif).toBeUndefined();
      expect(metadata.xmp).toBeUndefined();
    }
    expect(await storage.get(originalStorageKey)).toBeNull();
  });

  it('never enlarges an image narrower than a version', async () => {
    const { imageId } = await addImage(await createJpegWithGpsExif(300, 200));

    await service.processUploadedImage(imageId);

    expect(await loadVariants(imageId)).toEqual([
      { variant: 'large', width: 300, height: 200 },
      { variant: 'small', width: 300, height: 200 },
    ]);
  });

  it('rejects a text file renamed to .jpg, whatever its declared type', async () => {
    const { imageId, originalStorageKey } = await addImage(TEXT_FILE_NAMED_JPG, 'image/jpeg');

    expect(await service.processUploadedImage(imageId)).toBe('rejected');

    expect(await loadImage(imageId)).toEqual({ status: 'rejected', rejection_reason: 'not_an_image' });
    expect(storage.keys()).toEqual([]);
    expect(await storage.get(originalStorageKey)).toBeNull();
  });

  it('rejects a real image of a format it does not accept (an SVG declared as JPEG)', async () => {
    const { imageId } = await addImage(SVG_DOCUMENT, 'image/jpeg');

    expect(await service.processUploadedImage(imageId)).toBe('rejected');

    expect(await loadImage(imageId)).toEqual({ status: 'rejected', rejection_reason: 'unsupported_format' });
    expect(await loadVariants(imageId)).toEqual([]);
  });

  it('rejects an image over the pixel limit without decoding it', async () => {
    const { imageId } = await addImage(await createOversizedPng(), 'image/png');

    expect(await service.processUploadedImage(imageId)).toBe('rejected');

    expect(await loadImage(imageId)).toEqual({ status: 'rejected', rejection_reason: 'too_many_pixels' });
    expect(storage.keys()).toEqual([]);
  });

  it('rejects an image whose upload never arrived', async () => {
    const { imageId, originalStorageKey } = await addImage(await createJpegWithGpsExif(800, 600));
    await storage.delete(originalStorageKey);

    expect(await service.processUploadedImage(imageId)).toBe('rejected');
    expect(await loadImage(imageId)).toEqual({ status: 'rejected', rejection_reason: 'upload_missing' });
  });

  it('treats processing the same image again as a no-op', async () => {
    const { imageId } = await addImage(await createJpegWithGpsExif(2_000, 1_000));
    await service.processUploadedImage(imageId);
    const putsAfterFirstRun = storage.putCount;
    const variantsAfterFirstRun = await loadVariants(imageId);

    expect(await service.processUploadedImage(imageId)).toBe('skipped');

    expect(storage.putCount).toBe(putsAfterFirstRun);
    expect(await loadVariants(imageId)).toEqual(variantsAfterFirstRun);
    expect(await loadImage(imageId)).toEqual({ status: 'ready', rejection_reason: null });
  });

  it('leaves no stored versions behind when the owner deletes the image mid-processing', async () => {
    const { imageId } = await addImage(await createJpegWithGpsExif(1_200, 900));
    storage.beforePut = async () => {
      await pool.query('DELETE FROM artwork_images WHERE id = $1', [imageId]);
    };

    expect(await service.processUploadedImage(imageId)).toBe('skipped');

    expect(storage.keys().filter((key) => key.startsWith('variants/'))).toEqual([]);
  });

  describe('consumer', () => {
    let consumer: ImageProcessingConsumer;

    beforeAll(() => {
      const unusedConnection = new RabbitMqConnection('amqp://localhost:1', DEFAULT_MESSAGING_TOPOLOGY);
      consumer = new ImageProcessingConsumer(unusedConnection, service);
    });

    it('processes an ImageUploaded message and acks it', async () => {
      const { imageId } = await addImage(await createJpegWithGpsExif(1_000, 800));

      const decision = await consumer.handle({
        messageId: randomUUID(),
        type: 'ImageUploaded',
        body: { imageId, artworkId },
        deliveryCount: 1,
      });

      expect(decision).toBe('ack');
      expect(await loadImage(imageId)).toEqual({ status: 'ready', rejection_reason: null });
    });

    it('dead-letters a message with an invalid payload', async () => {
      const decision = await consumer.handle({
        messageId: randomUUID(),
        type: 'ImageUploaded',
        body: { imageId: 'not-a-uuid' },
        deliveryCount: 1,
      });

      expect(decision).toBe('dead_letter');
    });
  });
});
