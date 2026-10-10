import {
  ACCEPTED_IMAGE_FORMATS,
  AcceptedImageFormat,
  ImageRejectionReason,
  MAXIMUM_IMAGE_BYTE_SIZE,
  MAXIMUM_IMAGE_PIXELS,
} from './images.types';

/** Header metadata decoded from the real bytes; null when they are not a readable image. */
export interface InspectedImage {
  readonly format: string;
  readonly width: number;
  readonly height: number;
  readonly pageCount: number;
}

export interface ImageAcceptanceInput {
  readonly inspected: InspectedImage | null;
  readonly byteSize: number;
}

export type ImageAcceptanceDecision =
  | { readonly isAccepted: true; readonly format: AcceptedImageFormat }
  | { readonly isAccepted: false; readonly reason: ImageRejectionReason };

/** The declared content type is deliberately not an input: only the decoded bytes decide. */
export function decideImageAcceptance({ inspected, byteSize }: ImageAcceptanceInput): ImageAcceptanceDecision {
  if (byteSize > MAXIMUM_IMAGE_BYTE_SIZE) return { isAccepted: false, reason: 'file_too_large' };
  if (inspected === null) return { isAccepted: false, reason: 'not_an_image' };
  if (!isAcceptedFormat(inspected.format)) return { isAccepted: false, reason: 'unsupported_format' };
  // Checked from the header before any pixel is decoded, which is what stops a decompression bomb.
  if (inspected.width * inspected.height > MAXIMUM_IMAGE_PIXELS) return { isAccepted: false, reason: 'too_many_pixels' };
  if (inspected.pageCount > 1) return { isAccepted: false, reason: 'animated' };
  return { isAccepted: true, format: inspected.format };
}

const isAcceptedFormat = (format: string): format is AcceptedImageFormat =>
  (ACCEPTED_IMAGE_FORMATS as readonly string[]).includes(format);
