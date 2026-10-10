import type { ManagedArtworkImageView } from '../../../shared/api/api-types';

export const IMAGE_POLL_INTERVAL_MILLISECONDS = 1_500;
export const MAXIMUM_IMAGE_POLLS = 80;

export type ImagePollDecision = 'idle' | 'poll_again' | 'gave_up';

/** Processing finishes in the worker, with no push event, so the manager polls while anything is processing. */
export function decideImagePoll(images: readonly ManagedArtworkImageView[], completedPolls: number): ImagePollDecision {
  if (!images.some((image) => image.status === 'processing')) return 'idle';
  return completedPolls < MAXIMUM_IMAGE_POLLS ? 'poll_again' : 'gave_up';
}
