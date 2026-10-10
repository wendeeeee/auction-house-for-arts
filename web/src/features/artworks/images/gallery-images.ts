import type { ArtworkImageView, ManagedArtworkImageView } from '../../../shared/api/api-types';

/** The owner's list, reduced to what the public gallery shows, so the page updates without a reload. */
export function toGalleryImages(images: readonly ManagedArtworkImageView[]): ArtworkImageView[] {
  return images.flatMap((image) =>
    image.status === 'ready' && image.small && image.large
      ? [{ id: image.id, isCover: image.isCover, small: image.small, large: image.large }]
      : [],
  );
}

export function findInitialGalleryImage(images: readonly ArtworkImageView[]): ArtworkImageView | null {
  return images.find((image) => image.isCover) ?? images[0] ?? null;
}
