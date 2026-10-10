import type { ManagedArtworkImageView } from '../../../shared/api/api-types';

/** Mirrors the server's limits, to refuse an obviously wrong file before any upload starts. */
export const ACCEPTED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const MAXIMUM_IMAGE_BYTES = 15 * 1024 * 1024;
export const MAXIMUM_IMAGES_PER_ARTWORK = 8;

export interface FileToUpload {
  readonly name: string;
  readonly type: string;
  readonly size: number;
}

export type PlannedUpload<File extends FileToUpload> =
  | { readonly file: File; readonly isAccepted: true }
  | { readonly file: File; readonly isAccepted: false; readonly problem: string };

export function countImagesTowardLimit(images: readonly ManagedArtworkImageView[]): number {
  return images.filter((image) => image.status !== 'rejected').length;
}

export function planImageUploads<File extends FileToUpload>(
  files: readonly File[],
  imagesTowardLimit: number,
): PlannedUpload<File>[] {
  let freeSlots = Math.max(MAXIMUM_IMAGES_PER_ARTWORK - imagesTowardLimit, 0);
  return files.map((file) => {
    if (!(ACCEPTED_IMAGE_TYPES as readonly string[]).includes(file.type)) {
      return { file, isAccepted: false, problem: 'Only JPEG, PNG, and WebP photos can be uploaded.' };
    }
    if (file.size === 0) return { file, isAccepted: false, problem: 'This file is empty.' };
    if (file.size > MAXIMUM_IMAGE_BYTES) return { file, isAccepted: false, problem: 'This file is over 15 MB.' };
    if (freeSlots === 0) {
      return { file, isAccepted: false, problem: `An artwork can have at most ${MAXIMUM_IMAGES_PER_ARTWORK} images.` };
    }
    freeSlots -= 1;
    return { file, isAccepted: true };
  });
}
