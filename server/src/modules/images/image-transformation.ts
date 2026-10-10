import sharp from 'sharp';
import { InspectedImage } from './image-validation';
import { MAXIMUM_IMAGE_PIXELS } from './images.types';

export interface RenderedVariant {
  readonly body: Buffer;
  readonly width: number;
  readonly height: number;
}

/** Reads only the header, so a decompression bomb is measured without being decoded. */
export async function inspectImage(bytes: Buffer): Promise<InspectedImage | null> {
  try {
    const metadata = await sharp(bytes).metadata();
    if (metadata.width === undefined || metadata.height === undefined) return null;
    return { format: metadata.format, width: metadata.width, height: metadata.height, pageCount: metadata.pages ?? 1 };
  } catch {
    return null;
  }
}

/**
 * sharp drops EXIF (GPS included), XMP, and ICC unless asked to keep them. `rotate()` applies the
 * EXIF orientation first, or portrait photos would turn sideways once the tag is gone.
 */
export async function renderWebpVariant(bytes: Buffer, maximumWidth: number): Promise<RenderedVariant> {
  const { data, info } = await sharp(bytes, { limitInputPixels: MAXIMUM_IMAGE_PIXELS })
    .rotate()
    .resize({ width: maximumWidth, withoutEnlargement: true })
    .webp({ quality: 82 })
    .toBuffer({ resolveWithObject: true });
  return { body: data, width: info.width, height: info.height };
}
