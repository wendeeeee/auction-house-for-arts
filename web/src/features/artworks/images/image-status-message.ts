import { ApiError } from '../../../shared/api/api-error';
import type { ImageRejectionReason, ManagedArtworkImageView } from '../../../shared/api/api-types';

const REJECTION_MESSAGES: Record<ImageRejectionReason, string> = {
  file_too_large: 'Rejected: the file is over 15 MB.',
  not_an_image: 'Rejected: the file is not an image.',
  unsupported_format: 'Rejected: only JPEG, PNG, and WebP are accepted.',
  too_many_pixels: 'Rejected: over 50 megapixels. Resize it and try again.',
  animated: 'Rejected: animated images are not accepted.',
  upload_missing: 'Rejected: the upload never arrived.',
};

export function describeImageStatus(image: ManagedArtworkImageView): string {
  switch (image.status) {
    case 'pending':
      return 'Upload not finished. Delete it and try again.';
    case 'processing':
      return 'Processing…';
    case 'ready':
      return image.isCover ? 'Ready · cover image' : 'Ready';
    case 'rejected':
      return image.rejectionReason ? REJECTION_MESSAGES[image.rejectionReason] : 'Rejected.';
  }
}

export function describeImageActionError(error: unknown): string {
  if (!(error instanceof ApiError)) return 'Something went wrong. Please try again.';
  switch (error.code) {
    case 'IMAGE_LIMIT_REACHED':
      return 'This artwork already has the most images allowed. Delete one first.';
    case 'IMAGE_NOT_READY':
      return 'Only a processed image can be the cover.';
    case 'NOT_ARTWORK_OWNER':
      return 'Only the current owner can manage this work’s images.';
    case 'INVALID_IMAGE_ORDER':
      return 'The images changed meanwhile. Reload the page and try again.';
    default:
      return error.message;
  }
}
