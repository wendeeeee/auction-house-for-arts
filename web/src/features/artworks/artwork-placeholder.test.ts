import { describe, expect, it } from 'vitest';
import { artworkPlaceholderDataUri, generateArtworkPlaceholderSvg, hashSlug } from './artwork-placeholder';

const SEEDED_SLUGS = [
  'harmattan-light',
  'lagos-at-dusk',
  'study-of-hands',
  'northern-silence',
  'frozen-harbour',
  'tide-vessel',
  'signal-garden',
  'desert-geometry',
];

describe('hashSlug (FNV-1a, 32-bit)', () => {
  it('matches the published test vectors', () => {
    expect(hashSlug('')).toBe(0x811c9dc5);
    expect(hashSlug('a')).toBe(0xe40c292c);
    expect(hashSlug('foobar')).toBe(0xbf9cf968);
  });
});

describe('generateArtworkPlaceholderSvg', () => {
  it('returns the same SVG for the same slug', () => {
    for (const slug of SEEDED_SLUGS) {
      expect(generateArtworkPlaceholderSvg(slug)).toBe(generateArtworkPlaceholderSvg(slug));
    }
  });

  it('returns different SVGs for different slugs', () => {
    const outputs = new Set(SEEDED_SLUGS.map((slug) => generateArtworkPlaceholderSvg(slug)));
    expect(outputs.size).toBe(SEEDED_SLUGS.length);
  });

  it('is a single well-formed SVG element of the requested size', () => {
    const svg = generateArtworkPlaceholderSvg('tide-vessel', { width: 320, height: 240 });

    expect(svg.startsWith('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 240"')).toBe(true);
    expect(svg.endsWith('</svg>')).toBe(true);
    expect(svg.match(/<svg/g)).toHaveLength(1);
    expect(svg).not.toMatch(/NaN|undefined|Infinity/);
  });

  it('draws a ground plus three to six shapes', () => {
    for (const slug of SEEDED_SLUGS) {
      const elementCount = (generateArtworkPlaceholderSvg(slug).match(/<(circle|rect|path)\b/g) ?? []).length;
      // The first <rect> is the ground.
      expect(elementCount - 1).toBeGreaterThanOrEqual(3);
      expect(elementCount - 1).toBeLessThanOrEqual(6);
    }
  });

  it('can be used as an image data URI', () => {
    const uri = artworkPlaceholderDataUri('signal-garden');
    expect(uri.startsWith('data:image/svg+xml;charset=utf-8,%3Csvg')).toBe(true);
    expect(decodeURIComponent(uri.split(',')[1] ?? '')).toBe(generateArtworkPlaceholderSvg('signal-garden'));
  });
});
