import { InspectedImage, decideImageAcceptance } from './image-validation';
import { MAXIMUM_IMAGE_BYTE_SIZE, MAXIMUM_IMAGE_PIXELS } from './images.types';

const photo: InspectedImage = { format: 'jpeg', width: 4_000, height: 3_000, pageCount: 1 };

describe('decideImageAcceptance', () => {
  it.each(['jpeg', 'png', 'webp'])('accepts a %s image', (format) => {
    expect(decideImageAcceptance({ inspected: { ...photo, format }, byteSize: 1_000 })).toEqual({ isAccepted: true, format });
  });

  it('rejects bytes that do not decode as an image', () => {
    expect(decideImageAcceptance({ inspected: null, byteSize: 1_000 })).toEqual({ isAccepted: false, reason: 'not_an_image' });
  });

  it.each(['gif', 'svg', 'heif', 'tiff'])('rejects a real %s image', (format) => {
    expect(decideImageAcceptance({ inspected: { ...photo, format }, byteSize: 1_000 })).toEqual({
      isAccepted: false,
      reason: 'unsupported_format',
    });
  });

  it('accepts exactly the size limit and rejects one byte more', () => {
    expect(decideImageAcceptance({ inspected: photo, byteSize: MAXIMUM_IMAGE_BYTE_SIZE }).isAccepted).toBe(true);
    expect(decideImageAcceptance({ inspected: photo, byteSize: MAXIMUM_IMAGE_BYTE_SIZE + 1 })).toEqual({
      isAccepted: false,
      reason: 'file_too_large',
    });
  });

  it('accepts exactly the pixel limit and rejects anything above it', () => {
    const atLimit = { ...photo, width: 10_000, height: MAXIMUM_IMAGE_PIXELS / 10_000 };
    expect(decideImageAcceptance({ inspected: atLimit, byteSize: 1_000 }).isAccepted).toBe(true);
    expect(decideImageAcceptance({ inspected: { ...atLimit, height: atLimit.height + 1 }, byteSize: 1_000 })).toEqual({
      isAccepted: false,
      reason: 'too_many_pixels',
    });
  });

  it('rejects a tiny file that claims huge dimensions (a decompression bomb)', () => {
    const bomb = { format: 'png', width: 50_000, height: 50_000, pageCount: 1 };
    expect(decideImageAcceptance({ inspected: bomb, byteSize: 40_000 })).toEqual({ isAccepted: false, reason: 'too_many_pixels' });
  });

  it('rejects an animated image', () => {
    expect(decideImageAcceptance({ inspected: { ...photo, format: 'webp', pageCount: 12 }, byteSize: 1_000 })).toEqual({
      isAccepted: false,
      reason: 'animated',
    });
  });
});
