import { useMemo } from 'react';
import type { ArtworkImageView } from '../../shared/api/api-types';
import { artworkPlaceholderDataUri } from './artwork-placeholder';

type ArtworkImageSize = 'card' | 'large';

const SIZES_ATTRIBUTE: Record<ArtworkImageSize, string> = {
  card: '(min-width: 64rem) 18rem, (min-width: 40rem) 45vw, 100vw',
  large: '(min-width: 52rem) 40rem, 100vw',
};

/** A processed photo when there is one; otherwise the generated placeholder from phase 1. */
export function ArtworkImage({
  slug,
  title,
  image = null,
  size = 'card',
}: {
  slug: string;
  title: string;
  image?: ArtworkImageView | null;
  size?: ArtworkImageSize;
}) {
  const placeholder = useMemo(
    () => (image ? null : artworkPlaceholderDataUri(slug, size === 'large' ? { width: 800, height: 1000 } : { width: 400, height: 500 })),
    [image, slug, size],
  );

  if (image) {
    const variant = size === 'large' ? image.large : image.small;
    return (
      <img
        className={`artwork-image artwork-image--${size} artwork-image--photo`}
        src={variant.url}
        srcSet={`${image.small.url} ${image.small.width}w, ${image.large.url} ${image.large.width}w`}
        sizes={SIZES_ATTRIBUTE[size]}
        alt={`Photograph of “${title}”`}
        width={variant.width}
        height={variant.height}
        loading={size === 'card' ? 'lazy' : undefined}
        decoding="async"
      />
    );
  }
  return (
    <img
      className={`artwork-image artwork-image--${size}`}
      src={placeholder ?? undefined}
      alt={`Abstract placeholder for “${title}”`}
      width={size === 'large' ? 800 : 400}
      height={size === 'large' ? 1000 : 500}
    />
  );
}
