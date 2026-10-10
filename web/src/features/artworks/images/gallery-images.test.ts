import { describe, expect, it } from 'vitest';
import type { ManagedArtworkImageView } from '../../../shared/api/api-types';
import { findInitialGalleryImage, toGalleryImages } from './gallery-images';

const variant = (width: number) => ({ url: `/api/artwork-images/x/${width}`, width, height: width });

const managed = (id: string, overrides: Partial<ManagedArtworkImageView> = {}): ManagedArtworkImageView => ({
  id,
  status: 'ready',
  rejectionReason: null,
  position: 0,
  isCover: false,
  small: variant(400),
  large: variant(1_600),
  createdAt: '2026-02-01T09:00:00.000Z',
  ...overrides,
});

describe('toGalleryImages', () => {
  it('keeps only ready images, in order', () => {
    const images = [
      managed('a'),
      managed('b', { status: 'processing', small: null, large: null }),
      managed('c', { isCover: true }),
      managed('d', { status: 'rejected', rejectionReason: 'not_an_image', small: null, large: null }),
    ];
    expect(toGalleryImages(images)).toEqual([
      { id: 'a', isCover: false, small: variant(400), large: variant(1_600) },
      { id: 'c', isCover: true, small: variant(400), large: variant(1_600) },
    ]);
  });
});

describe('findInitialGalleryImage', () => {
  it('opens on the cover, else the first image, else nothing', () => {
    const [first, second] = toGalleryImages([managed('a'), managed('b', { isCover: true })]);
    expect(findInitialGalleryImage([first!, second!])?.id).toBe('b');
    expect(findInitialGalleryImage([first!])?.id).toBe('a');
    expect(findInitialGalleryImage([])).toBeNull();
  });
});
