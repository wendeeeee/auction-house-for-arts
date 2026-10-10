import { describe, expect, it } from 'vitest';
import { ApiError } from '../../../shared/api/api-error';
import type { ManagedArtworkImageView } from '../../../shared/api/api-types';
import { describeImageActionError, describeImageStatus } from './image-status-message';

const image = (overrides: Partial<ManagedArtworkImageView>): ManagedArtworkImageView => ({
  id: 'image-1',
  status: 'ready',
  rejectionReason: null,
  position: 0,
  isCover: false,
  small: null,
  large: null,
  createdAt: '2026-02-01T09:00:00.000Z',
  ...overrides,
});

describe('describeImageStatus', () => {
  it('describes each status', () => {
    expect(describeImageStatus(image({ status: 'pending' }))).toBe('Upload not finished. Delete it and try again.');
    expect(describeImageStatus(image({ status: 'processing' }))).toBe('Processing…');
    expect(describeImageStatus(image({ status: 'ready' }))).toBe('Ready');
    expect(describeImageStatus(image({ status: 'ready', isCover: true }))).toBe('Ready · cover image');
  });

  it('explains why an image was rejected', () => {
    expect(describeImageStatus(image({ status: 'rejected', rejectionReason: 'not_an_image' }))).toBe(
      'Rejected: the file is not an image.',
    );
    expect(describeImageStatus(image({ status: 'rejected', rejectionReason: 'too_many_pixels' }))).toBe(
      'Rejected: over 50 megapixels. Resize it and try again.',
    );
  });
});

describe('describeImageActionError', () => {
  it('words the image rules', () => {
    const limit = new ApiError(409, 'IMAGE_LIMIT_REACHED', 'server text', {}, null);
    expect(describeImageActionError(limit)).toBe('This artwork already has the most images allowed. Delete one first.');
  });

  it('falls back to the server message, or a generic one for non-API failures', () => {
    expect(describeImageActionError(new ApiError(500, 'INTERNAL_ERROR', 'Server exploded.', {}, null))).toBe('Server exploded.');
    expect(describeImageActionError(new Error('boom'))).toBe('Something went wrong. Please try again.');
  });
});
