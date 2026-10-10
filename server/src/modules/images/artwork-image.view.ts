import { z } from 'zod';
import { resolveCoverImage } from './cover-image';
import { ArtworkImage, IMAGE_REJECTION_REASONS, IMAGE_STATUSES, ImageVariantName } from './images.types';
import type { StartedImageUpload } from './image-upload.service';

export const artworkImageFileUrl = (imageId: string, variant: ImageVariantName): string =>
  `/api/artwork-images/${imageId}/${variant}`;

const imageVariantViewSchema = z.object({
  url: z.string().describe('A stable URL; the bytes behind it never change.'),
  width: z.number().int(),
  height: z.number().int(),
});

export const artworkImageViewSchema = z.object({
  id: z.uuid(),
  isCover: z.boolean(),
  small: imageVariantViewSchema.describe('WebP, at most 400 px wide.'),
  large: imageVariantViewSchema.describe('WebP, at most 1,600 px wide.'),
});
export type ArtworkImageView = z.infer<typeof artworkImageViewSchema>;

export const managedArtworkImageViewSchema = z.object({
  id: z.uuid(),
  status: z.enum(IMAGE_STATUSES),
  rejectionReason: z.enum(IMAGE_REJECTION_REASONS).nullable(),
  position: z.number().int(),
  isCover: z.boolean(),
  small: imageVariantViewSchema.nullable(),
  large: imageVariantViewSchema.nullable(),
  createdAt: z.iso.datetime(),
});
export type ManagedArtworkImageView = z.infer<typeof managedArtworkImageViewSchema>;

export const managedArtworkImageListViewSchema = z.object({ items: z.array(managedArtworkImageViewSchema) });
export type ManagedArtworkImageListView = z.infer<typeof managedArtworkImageListViewSchema>;

export const startedImageUploadViewSchema = z.object({
  image: managedArtworkImageViewSchema,
  upload: z.object({
    method: z.literal('PUT'),
    url: z.string(),
    headers: z.record(z.string(), z.string()).describe('Send exactly these headers with the file.'),
    expiresAt: z.iso.datetime(),
  }),
});
export type StartedImageUploadView = z.infer<typeof startedImageUploadViewSchema>;

/** Ready images only. `isCover` marks the effective cover, chosen or not. */
export function toArtworkImageViews(images: readonly ArtworkImage[]): ArtworkImageView[] {
  const cover = resolveCoverImage(images);
  return images.flatMap((image) => {
    const small = toVariantView(image, 'small');
    const large = toVariantView(image, 'large');
    return image.status === 'ready' && small && large ? [{ id: image.id, isCover: image.id === cover?.id, small, large }] : [];
  });
}

export function toCoverImageView(images: readonly ArtworkImage[]): ArtworkImageView | null {
  return toArtworkImageViews(images).find((image) => image.isCover) ?? null;
}

export function toManagedArtworkImageViews(images: readonly ArtworkImage[]): ManagedArtworkImageView[] {
  const cover = resolveCoverImage(images);
  return images.map((image) => toManagedArtworkImageView(image, image.id === cover?.id));
}

export function toStartedImageUploadView(started: StartedImageUpload): StartedImageUploadView {
  return {
    image: toManagedArtworkImageView(started.image, false),
    upload: { method: 'PUT', url: started.uploadUrl, headers: { ...started.uploadHeaders }, expiresAt: started.expiresAt.toISOString() },
  };
}

export function toManagedArtworkImageView(image: ArtworkImage, isCover: boolean): ManagedArtworkImageView {
  return {
    id: image.id,
    status: image.status,
    rejectionReason: image.rejectionReason,
    position: image.position,
    isCover,
    small: toVariantView(image, 'small'),
    large: toVariantView(image, 'large'),
    createdAt: image.createdAt.toISOString(),
  };
}

function toVariantView(image: ArtworkImage, name: ImageVariantName): z.infer<typeof imageVariantViewSchema> | null {
  const variant = image.variants.find((candidate) => candidate.name === name);
  return variant ? { url: artworkImageFileUrl(image.id, name), width: variant.width, height: variant.height } : null;
}
