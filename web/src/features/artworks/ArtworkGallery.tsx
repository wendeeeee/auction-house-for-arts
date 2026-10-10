import { useState } from 'react';
import type { ArtworkImageView } from '../../shared/api/api-types';
import { ArtworkImage } from './ArtworkImage';
import { findInitialGalleryImage } from './images/gallery-images';

export function ArtworkGallery({ slug, title, images }: { slug: string; title: string; images: readonly ArtworkImageView[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = images.find((image) => image.id === selectedId) ?? findInitialGalleryImage(images);

  return (
    <div className="artwork-gallery">
      <ArtworkImage slug={slug} title={title} image={selected} size="large" />
      {images.length > 1 && (
        <ul className="artwork-gallery__thumbs" aria-label="Images of this work">
          {images.map((image, index) => (
            <li key={image.id}>
              <button
                type="button"
                className="artwork-gallery__thumb"
                aria-pressed={image.id === selected?.id}
                aria-label={`Show image ${index + 1} of ${images.length}`}
                onClick={() => setSelectedId(image.id)}
              >
                <img src={image.small.url} alt="" width={image.small.width} height={image.small.height} loading="lazy" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
