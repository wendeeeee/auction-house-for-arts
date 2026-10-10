import { Inject, Injectable, Logger } from '@nestjs/common';
import { Clock } from '../../common/clock';
import { UnitOfWork } from '../../database';
import { ArtworkImageRepository } from './artwork-image.repository';
import { inspectImage, renderWebpVariant } from './image-transformation';
import { decideImageAcceptance } from './image-validation';
import {
  ArtworkImage,
  ArtworkImageVariant,
  IMAGE_VARIANT_NAMES,
  IMAGE_VARIANT_WIDTHS,
  ImageRejectionReason,
  variantStorageKey,
} from './images.types';
import { BLOB_STORAGE, BlobStorage } from './storage/blob-storage';

export type ImageProcessingOutcome = 'ready' | 'rejected' | 'skipped';

/**
 * Idempotent, because delivery is at least once: a terminal image is skipped, variant keys are
 * deterministic, and the status changes only by compare-and-set on `processing`.
 * No transaction is held across a storage call.
 */
@Injectable()
export class ImageProcessingService {
  private readonly logger = new Logger(ImageProcessingService.name);

  constructor(
    private readonly unitOfWork: UnitOfWork,
    private readonly imageRepository: ArtworkImageRepository,
    @Inject(BLOB_STORAGE) private readonly blobStorage: BlobStorage,
    private readonly clock: Clock,
  ) {}

  async processUploadedImage(imageId: string): Promise<ImageProcessingOutcome> {
    const image = await this.imageRepository.findById(imageId);
    if (!image || image.status !== 'processing') return 'skipped';

    const original = await this.blobStorage.get(image.originalStorageKey);
    if (!original) return this.reject(image, 'upload_missing');

    const inspected = await inspectImage(original.body);
    const decision = decideImageAcceptance({ inspected, byteSize: original.body.length });
    if (!decision.isAccepted) return this.reject(image, decision.reason);

    const variants: ArtworkImageVariant[] = [];
    for (const name of IMAGE_VARIANT_NAMES) {
      const rendered = await renderWebpVariant(original.body, IMAGE_VARIANT_WIDTHS[name]);
      const storageKey = variantStorageKey(image.id, name);
      await this.blobStorage.put(storageKey, rendered.body, 'image/webp');
      variants.push({ name, width: rendered.width, height: rendered.height, byteSize: rendered.body.length, storageKey });
    }

    const isMarkedReady = await this.unitOfWork.run(() => this.imageRepository.markReady(image.id, variants, this.clock.now()));
    if (!isMarkedReady) {
      // A duplicate delivery finished first (same keys, so keep them), or the owner deleted the image meanwhile.
      if (!(await this.imageRepository.findById(image.id))) await this.deleteObjects(variants.map((variant) => variant.storageKey));
      return 'skipped';
    }
    await this.deleteObjects([image.originalStorageKey]);
    return 'ready';
  }

  private async reject(image: ArtworkImage, reason: ImageRejectionReason): Promise<ImageProcessingOutcome> {
    const isMarkedRejected = await this.imageRepository.markRejected(image.id, reason, this.clock.now());
    if (!isMarkedRejected) return 'skipped';
    await this.deleteObjects([image.originalStorageKey]);
    return 'rejected';
  }

  /** The original is deleted once processed: it is the only copy that still carries GPS data. */
  private async deleteObjects(storageKeys: readonly string[]): Promise<void> {
    for (const storageKey of storageKeys) {
      try {
        await this.blobStorage.delete(storageKey);
      } catch (error) {
        this.logger.warn(`could not delete ${storageKey}, leaving an orphan: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }
}
