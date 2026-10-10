import { useMemo } from 'react';
import { artworkPlaceholderDataUri } from './artwork-placeholder';

/** Placeholder visual until image uploads arrive in phase 6. */
export function ArtworkImage({ slug, title, size = 'card' }: { slug: string; title: string; size?: 'card' | 'large' }) {
  const source = useMemo(
    () => artworkPlaceholderDataUri(slug, size === 'large' ? { width: 800, height: 1000 } : { width: 400, height: 500 }),
    [slug, size],
  );
  return (
    <img
      className={`artwork-image artwork-image--${size}`}
      src={source}
      alt={`Abstract placeholder for “${title}”`}
      width={size === 'large' ? 800 : 400}
      height={size === 'large' ? 1000 : 500}
    />
  );
}
