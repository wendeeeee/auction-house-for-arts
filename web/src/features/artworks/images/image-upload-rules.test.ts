import { describe, expect, it } from 'vitest';
import type { ManagedArtworkImageView } from '../../../shared/api/api-types';
import { MAXIMUM_IMAGE_BYTES, countImagesTowardLimit, planImageUploads } from './image-upload-rules';

const photo = (name: string, overrides: { type?: string; size?: number } = {}) => ({
  name,
  type: overrides.type ?? 'image/jpeg',
  size: overrides.size ?? 2_000_000,
});

describe('planImageUploads', () => {
  it('accepts JPEG, PNG, and WebP photos within the size limit', () => {
    const plans = planImageUploads([photo('a.jpg'), photo('b.png', { type: 'image/png' }), photo('c.webp', { type: 'image/webp' })], 0);
    expect(plans.every((plan) => plan.isAccepted)).toBe(true);
  });

  it('refuses other types, empty files, and files over 15 MB', () => {
    const plans = planImageUploads(
      [photo('a.gif', { type: 'image/gif' }), photo('b.heic', { type: '' }), photo('c.jpg', { size: 0 }), photo('d.jpg', { size: MAXIMUM_IMAGE_BYTES + 1 })],
      0,
    );
    expect(plans.map((plan) => (plan.isAccepted ? 'accepted' : plan.problem))).toEqual([
      'Only JPEG, PNG, and WebP photos can be uploaded.',
      'Only JPEG, PNG, and WebP photos can be uploaded.',
      'This file is empty.',
      'This file is over 15 MB.',
    ]);
  });

  it('accepts only as many files as there are free slots, in the order chosen', () => {
    const plans = planImageUploads([photo('a.jpg'), photo('b.jpg'), photo('c.jpg')], 6);
    expect(plans.map((plan) => plan.isAccepted)).toEqual([true, true, false]);
  });

  it('does not spend a slot on a refused file', () => {
    const plans = planImageUploads([photo('a.gif', { type: 'image/gif' }), photo('b.jpg')], 7);
    expect(plans.map((plan) => plan.isAccepted)).toEqual([false, true]);
  });
});

describe('countImagesTowardLimit', () => {
  it('counts every image except rejected ones', () => {
    const statuses = ['pending', 'processing', 'ready', 'rejected'] as const;
    const images = statuses.map((status) => ({ status }) as ManagedArtworkImageView);
    expect(countImagesTowardLimit(images)).toBe(3);
  });
});
