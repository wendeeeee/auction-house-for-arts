import { Inject, Injectable } from '@nestjs/common';
import { ArtworkImageRepository } from './artwork-image.repository';
import { ImageNotFoundError } from './images.errors';
import { ArtworkImage, ImageVariantName } from './images.types';
import { BLOB_STORAGE, BlobStorage } from './storage/blob-storage';

@Injectable()
export class ArtworkImageQueryService {
  constructor(
    private readonly imageRepository: ArtworkImageRepository,
    @Inject(BLOB_STORAGE) private readonly blobStorage: BlobStorage,
  ) {}

  /** Ready images only, in gallery order. Artworks without any are absent from the map. */
  async findReadyImagesByArtworkIds(artworkIds: readonly string[]): Promise<Map<string, ArtworkImage[]>> {
    const images = await this.imageRepository.findReadyByArtworkIds(artworkIds);
    const imagesByArtworkId = new Map<string, ArtworkImage[]>();
    for (const image of images) {
      imagesByArtworkId.set(image.artworkId, [...(imagesByArtworkId.get(image.artworkId) ?? []), image]);
    }
    return imagesByArtworkId;
  }

  /** Only processed versions are ever read here; an original has no variant row, so it cannot be served. */
  async readVariantFile(imageId: string, variant: ImageVariantName): Promise<Buffer> {
    const stored = await this.imageRepository.findReadyVariant(imageId, variant);
    if (!stored) throw new ImageNotFoundError(imageId);
    const blob = await this.blobStorage.get(stored.storageKey);
    if (!blob) throw new ImageNotFoundError(imageId);
    return blob.body;
  }
}
