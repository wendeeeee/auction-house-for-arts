import { randomUUID } from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Clock } from '../../common/clock';
import { UnitOfWork } from '../../database';
import { OutboxService } from '../outbox';
import { ArtworkImageRepository } from './artwork-image.repository';
import { decideImageOrder } from './image-order';
import { ImageLimitReachedError, ImageNotFoundError, ImageNotReadyError, InvalidImageOrderError } from './images.errors';
import {
  AcceptedImageContentType,
  ArtworkImage,
  MAXIMUM_IMAGES_PER_ARTWORK,
  UPLOAD_URL_EXPIRY_SECONDS,
} from './images.types';
import { BLOB_STORAGE, BlobStorage } from './storage/blob-storage';

export interface ImageUploadRequest {
  readonly artworkId: string;
  readonly uploadedByUserId: string;
  readonly contentType: AcceptedImageContentType;
  readonly byteSize: number;
}

export interface StartedImageUpload {
  readonly image: ArtworkImage;
  readonly uploadUrl: string;
  readonly uploadHeaders: Readonly<Record<string, string>>;
  readonly expiresAt: Date;
}

/** Callers pass an artwork ID they have already authorized: this module does not know who owns an artwork. */
@Injectable()
export class ImageUploadService {
  private readonly logger = new Logger(ImageUploadService.name);

  constructor(
    private readonly unitOfWork: UnitOfWork,
    private readonly imageRepository: ArtworkImageRepository,
    private readonly outboxService: OutboxService,
    @Inject(BLOB_STORAGE) private readonly blobStorage: BlobStorage,
    private readonly clock: Clock,
  ) {}

  async requestUpload(request: ImageUploadRequest): Promise<StartedImageUpload> {
    const image = await this.unitOfWork.run(async () => {
      await this.imageRepository.lockArtworkImages(request.artworkId);
      if ((await this.imageRepository.countTowardLimit(request.artworkId)) >= MAXIMUM_IMAGES_PER_ARTWORK) {
        throw new ImageLimitReachedError(MAXIMUM_IMAGES_PER_ARTWORK);
      }
      return this.imageRepository.insertPending({
        id: randomUUID(),
        artworkId: request.artworkId,
        uploadedByUserId: request.uploadedByUserId,
        declaredContentType: request.contentType,
        declaredByteSize: request.byteSize,
        originalStorageKey: `originals/${randomUUID()}`,
        position: await this.imageRepository.findNextPosition(request.artworkId),
        createdAt: this.clock.now(),
      });
    });

    const presigned = await this.blobStorage.presignPut({
      key: image.originalStorageKey,
      contentType: image.declaredContentType,
      byteSize: image.declaredByteSize,
      expiresInSeconds: UPLOAD_URL_EXPIRY_SECONDS,
    });
    return {
      image,
      uploadUrl: presigned.url,
      uploadHeaders: presigned.headers,
      expiresAt: new Date(image.createdAt.getTime() + UPLOAD_URL_EXPIRY_SECONDS * 1_000),
    };
  }

  /** Idempotent: only the first call moves the image to processing and enqueues ImageUploaded. */
  async completeUpload(artworkId: string, imageId: string): Promise<ArtworkImage> {
    return this.unitOfWork.run(async () => {
      await this.imageRepository.lockArtworkImages(artworkId);
      const image = await this.findImageOfArtwork(artworkId, imageId);
      if (image.status !== 'pending') return image;

      await this.imageRepository.markProcessing(image.id, this.clock.now());
      await this.outboxService.recordEvent('ImageUploaded', { imageId: image.id, artworkId });
      return this.findImageOfArtwork(artworkId, image.id);
    });
  }

  listImages(artworkId: string): Promise<ArtworkImage[]> {
    return this.imageRepository.findByArtworkId(artworkId);
  }

  async reorderImages(artworkId: string, orderedImageIds: readonly string[]): Promise<ArtworkImage[]> {
    await this.unitOfWork.run(async () => {
      await this.imageRepository.lockArtworkImages(artworkId);
      const current = await this.imageRepository.findByArtworkId(artworkId);
      const decision = decideImageOrder(
        current.map((image) => image.id),
        orderedImageIds,
      );
      if (!decision.isValid) throw new InvalidImageOrderError({ reason: decision.reason, imageIds: decision.imageIds });
      await this.imageRepository.updatePositions(artworkId, orderedImageIds);
    });
    return this.listImages(artworkId);
  }

  async chooseCover(artworkId: string, imageId: string): Promise<ArtworkImage[]> {
    await this.unitOfWork.run(async () => {
      await this.imageRepository.lockArtworkImages(artworkId);
      const image = await this.findImageOfArtwork(artworkId, imageId);
      if (image.status !== 'ready') throw new ImageNotReadyError(image.id, image.status);
      await this.imageRepository.setCover(artworkId, image.id);
    });
    return this.listImages(artworkId);
  }

  /**
   * The row goes first, then the objects. The reverse could leave a ready image whose files
   * are gone; this order can at worst leave an unreferenced object, which is harmless.
   */
  async deleteImage(artworkId: string, imageId: string): Promise<void> {
    const deleted = await this.unitOfWork.run(async () => {
      await this.imageRepository.lockArtworkImages(artworkId);
      const image = await this.findImageOfArtwork(artworkId, imageId);
      await this.imageRepository.delete(image.id);
      return image;
    });

    const storageKeys = [deleted.originalStorageKey, ...deleted.variants.map((variant) => variant.storageKey)];
    for (const storageKey of storageKeys) {
      try {
        await this.blobStorage.delete(storageKey);
      } catch (error) {
        this.logger.warn(`could not delete ${storageKey}, leaving an orphan: ${error instanceof Error ? error.message : String(error)}`);
      }
    }
  }

  private async findImageOfArtwork(artworkId: string, imageId: string): Promise<ArtworkImage> {
    const image = await this.imageRepository.findById(imageId);
    if (!image || image.artworkId !== artworkId) throw new ImageNotFoundError(imageId);
    return image;
  }
}
