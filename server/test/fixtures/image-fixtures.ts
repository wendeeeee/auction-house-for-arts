import sharp from 'sharp';

/** Generated rather than committed, so the fixtures are small, readable, and exact. */
export function createJpegWithGpsExif(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 120, g: 80, b: 40 } } })
    .jpeg()
    .withExif({
      IFD0: { Copyright: 'Test Photographer' },
      IFD3: { GPSLatitudeRef: 'N', GPSLatitude: '51/1 30/1 3230/100', GPSLongitudeRef: 'W', GPSLongitude: '0/1 7/1 4366/100' },
    })
    .toBuffer();
}

/** 56 megapixels in well under 1 MB: what a decompression bomb looks like. */
export function createOversizedPng(): Promise<Buffer> {
  return sharp({ create: { width: 8_000, height: 7_000, channels: 3, background: '#ffffff' } }).png().toBuffer();
}

export const TEXT_FILE_NAMED_JPG = Buffer.from('These are meeting notes, not a photograph.\n', 'utf8');

export const SVG_DOCUMENT = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" width="600" height="600"><rect width="600" height="600" fill="navy"/></svg>',
  'utf8',
);
