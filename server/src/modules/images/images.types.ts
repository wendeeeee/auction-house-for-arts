/** Mirror the CHECK constraints in 010_artwork_images.sql. */
export const ACCEPTED_IMAGE_CONTENT_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type AcceptedImageContentType = (typeof ACCEPTED_IMAGE_CONTENT_TYPES)[number];

/** As sharp reports them after decoding the real bytes. */
export const ACCEPTED_IMAGE_FORMATS = ['jpeg', 'png', 'webp'] as const;
export type AcceptedImageFormat = (typeof ACCEPTED_IMAGE_FORMATS)[number];

export const MAXIMUM_IMAGE_BYTE_SIZE = 15 * 1024 * 1024;
export const MAXIMUM_IMAGE_PIXELS = 50_000_000;
export const MAXIMUM_IMAGES_PER_ARTWORK = 8;
export const UPLOAD_URL_EXPIRY_SECONDS = 5 * 60;

export const IMAGE_STATUSES = ['pending', 'processing', 'ready', 'rejected'] as const;
export type ImageStatus = (typeof IMAGE_STATUSES)[number];

export const IMAGE_REJECTION_REASONS = [
  'file_too_large',
  'not_an_image',
  'unsupported_format',
  'too_many_pixels',
  'animated',
  'upload_missing',
] as const;
export type ImageRejectionReason = (typeof IMAGE_REJECTION_REASONS)[number];

export const IMAGE_VARIANT_NAMES = ['small', 'large'] as const;
export type ImageVariantName = (typeof IMAGE_VARIANT_NAMES)[number];
export const IMAGE_VARIANT_WIDTHS: { readonly [Name in ImageVariantName]: number } = { small: 400, large: 1_600 };

export interface ArtworkImageVariant {
  readonly name: ImageVariantName;
  readonly width: number;
  readonly height: number;
  readonly byteSize: number;
  readonly storageKey: string;
}

export interface ArtworkImage {
  readonly id: string;
  readonly artworkId: string;
  readonly uploadedByUserId: string;
  readonly status: ImageStatus;
  readonly declaredContentType: AcceptedImageContentType;
  readonly declaredByteSize: number;
  readonly originalStorageKey: string;
  readonly position: number;
  readonly isCover: boolean;
  readonly rejectionReason: ImageRejectionReason | null;
  readonly createdAt: Date;
  readonly completedAt: Date | null;
  readonly processedAt: Date | null;
  /** Empty unless the image is ready. */
  readonly variants: readonly ArtworkImageVariant[];
}

export const variantStorageKey = (imageId: string, variant: ImageVariantName): string => `variants/${imageId}/${variant}.webp`;
