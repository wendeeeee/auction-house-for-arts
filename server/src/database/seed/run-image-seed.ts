import { Logger, Module } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { ClockModule } from '../../common/clock';
import { ConfigModule } from '../../config';
import { ArtworkCatalogService, ArtworksModule } from '../../modules/artworks';
import { ImageUploadService, ImagesModule } from '../../modules/images';
import { DatabaseModule } from '../database.module';
import {
  OPEN_ACCESS_SEARCHES,
  OpenAccessResult,
  buildIiifImageUrl,
  buildOpenAccessSearchUrl,
  chooseOpenAccessResult,
} from './art-institute-open-access';

// The Art Institute asks API clients to identify themselves; its CDN refuses bare user agents.
const REQUEST_HEADERS = {
  'AIC-User-Agent': 'art-auction-house-seed (portfolio project)',
  'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) art-auction-house-seed',
};
const IMAGE_WIDTHS = [1_686, 843];
const SEARCH_LIMIT = 20;

@Module({ imports: [ConfigModule, ClockModule, DatabaseModule, ArtworksModule, ImagesModule] })
class ImageSeedModule {}

/**
 * `npm run seed:images`: attaches a public-domain image to a few seeded artworks through the real
 * pipeline (presigned PUT, complete, outbox, worker). Skips artworks that already have images.
 * Needs network access and MinIO; the worker (`npm run dev`) does the processing.
 */
async function main(): Promise<void> {
  const logger = new Logger('ImageSeed');
  const app = await NestFactory.createApplicationContext(ImageSeedModule, { logger: ['log', 'warn', 'error'] });
  const catalog = app.get(ArtworkCatalogService);
  const uploads = app.get(ImageUploadService);
  const usedImageIds = new Set<string>();
  let attachedCount = 0;

  try {
    for (const search of OPEN_ACCESS_SEARCHES) {
      const { artwork } = await catalog.getArtworkBySlug(search.artworkSlug);
      const existing = await uploads.listImages(artwork.id);
      if (existing.some((image) => image.status !== 'rejected')) {
        logger.log(`${search.artworkSlug}: already has images, skipping`);
        continue;
      }

      const chosen = chooseOpenAccessResult(await searchOpenAccess(search.query), search.classificationKeywords, usedImageIds);
      if (!chosen) {
        logger.warn(`${search.artworkSlug}: no public-domain match for "${search.query}"`);
        continue;
      }
      usedImageIds.add(chosen.image_id);
      const bytes = await downloadImage(chosen.image_id);

      const started = await uploads.requestUpload({
        artworkId: artwork.id,
        uploadedByUserId: artwork.ownerUserId,
        contentType: 'image/jpeg',
        byteSize: bytes.length,
      });
      const response = await fetch(started.uploadUrl, { method: 'PUT', headers: { ...started.uploadHeaders }, body: bytes });
      if (!response.ok) throw new Error(`storage refused the upload for ${search.artworkSlug} (${response.status})`);
      await uploads.completeUpload(artwork.id, started.image.id);

      attachedCount += 1;
      logger.log(`${search.artworkSlug}: "${chosen.title}" by ${chosen.artist_title ?? 'unknown'} (Art Institute of Chicago, CC0)`);
    }
  } finally {
    await app.close();
  }
  logger.log(`queued ${attachedCount} image(s); the worker processes them within a few seconds`);
}

async function searchOpenAccess(query: string): Promise<OpenAccessResult[]> {
  const response = await fetch(buildOpenAccessSearchUrl(query, SEARCH_LIMIT), { headers: REQUEST_HEADERS });
  if (!response.ok) throw new Error(`Art Institute search failed (${response.status})`);
  return ((await response.json()) as { data: OpenAccessResult[] }).data;
}

async function downloadImage(imageId: string): Promise<Buffer> {
  for (const width of IMAGE_WIDTHS) {
    const response = await fetch(buildIiifImageUrl(imageId, width), { headers: { ...REQUEST_HEADERS, Accept: 'image/jpeg' } });
    if (response.ok) return Buffer.from(await response.arrayBuffer());
  }
  throw new Error(`could not download image ${imageId}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
