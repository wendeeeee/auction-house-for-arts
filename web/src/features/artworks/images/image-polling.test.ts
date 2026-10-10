import { describe, expect, it } from 'vitest';
import type { ImageStatus, ManagedArtworkImageView } from '../../../shared/api/api-types';
import { MAXIMUM_IMAGE_POLLS, decideImagePoll } from './image-polling';

const withStatuses = (...statuses: ImageStatus[]) => statuses.map((status) => ({ status }) as ManagedArtworkImageView);

describe('decideImagePoll', () => {
  it('stays idle when nothing is processing', () => {
    expect(decideImagePoll(withStatuses('ready', 'rejected', 'pending'), 0)).toBe('idle');
    expect(decideImagePoll([], 0)).toBe('idle');
  });

  it('polls again while an image is processing', () => {
    expect(decideImagePoll(withStatuses('ready', 'processing'), 3)).toBe('poll_again');
  });

  it('gives up after the last allowed poll', () => {
    expect(decideImagePoll(withStatuses('processing'), MAXIMUM_IMAGE_POLLS)).toBe('gave_up');
  });
});
