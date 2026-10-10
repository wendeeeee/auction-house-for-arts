/**
 * A deterministic abstract composition for an artwork, generated from its slug, used until
 * real images arrive (phase 6). The same slug always yields the same SVG, on every machine,
 * because the only source of variation is a PRNG seeded from a hash of the slug.
 */

export interface PlaceholderSize {
  readonly width: number;
  readonly height: number;
}

const DEFAULT_SIZE: PlaceholderSize = { width: 400, height: 500 };

/** Muted, gallery-wall palettes: [ground, ...accents]. */
const PALETTES: readonly (readonly string[])[] = [
  ['#efe6d8', '#b5462f', '#1f3a5f', '#d9a441', '#2b2a27'],
  ['#e9ece6', '#3e6b5a', '#c97b4a', '#202a2e', '#a9b8a3'],
  ['#f2ebe3', '#7a2e3a', '#e0b07a', '#3b3f58', '#c9c2b8'],
  ['#e4e1da', '#1d4e89', '#f2c14e', '#b33f40', '#28282b'],
  ['#ece3d3', '#5b4b8a', '#d97b66', '#2f4f4f', '#f0d9a7'],
  ['#dfe5e8', '#24384b', '#d65a31', '#9fb4bf', '#eadbc8'],
];

/** FNV-1a, 32-bit: a tiny, well-known string hash with good spread for short inputs. */
export function hashSlug(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** Mulberry32: a small seeded PRNG returning floats in [0, 1). */
function createRandom(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}

/** One decimal place: keeps the markup short and the output byte-identical across engines. */
const round = (value: number): string => value.toFixed(1);

export function generateArtworkPlaceholderSvg(slug: string, size: PlaceholderSize = DEFAULT_SIZE): string {
  const random = createRandom(hashSlug(slug));
  const pick = <T,>(items: readonly T[]): T => items[Math.floor(random() * items.length)] as T;
  const between = (minimum: number, maximum: number): number => minimum + random() * (maximum - minimum);

  const palette = pick(PALETTES);
  const ground = palette[0] ?? '#efe6d8';
  const accents = palette.slice(1);
  const { width, height } = size;
  const shortSide = Math.min(width, height);

  const shapes: string[] = [];
  const shapeCount = 3 + Math.floor(random() * 4);
  for (let index = 0; index < shapeCount; index += 1) {
    const fill = pick(accents);
    const opacity = round(between(0.55, 0.95));
    switch (pick(['circle', 'rectangle', 'band', 'arc'] as const)) {
      case 'circle':
        shapes.push(
          `<circle cx="${round(between(0, width))}" cy="${round(between(0, height))}" r="${round(between(0.08, 0.32) * shortSide)}" fill="${fill}" fill-opacity="${opacity}"/>`,
        );
        break;
      case 'rectangle': {
        const rectangleWidth = between(0.15, 0.6) * width;
        const rectangleHeight = between(0.1, 0.5) * height;
        shapes.push(
          `<rect x="${round(between(-0.1, 0.8) * width)}" y="${round(between(-0.1, 0.8) * height)}" width="${round(rectangleWidth)}" height="${round(rectangleHeight)}" fill="${fill}" fill-opacity="${opacity}" transform="rotate(${round(between(-20, 20))} ${round(width / 2)} ${round(height / 2)})"/>`,
        );
        break;
      }
      case 'band':
        shapes.push(
          `<rect x="0" y="${round(between(0, 0.9) * height)}" width="${width}" height="${round(between(0.02, 0.12) * height)}" fill="${fill}" fill-opacity="${opacity}"/>`,
        );
        break;
      case 'arc': {
        const radius = between(0.2, 0.45) * shortSide;
        const centerX = between(0.2, 0.8) * width;
        const centerY = between(0.2, 0.8) * height;
        shapes.push(
          `<path d="M ${round(centerX - radius)} ${round(centerY)} A ${round(radius)} ${round(radius)} 0 0 1 ${round(centerX + radius)} ${round(centerY)}" fill="none" stroke="${fill}" stroke-width="${round(between(4, 14))}" stroke-opacity="${opacity}"/>`,
        );
        break;
      }
    }
  }

  return [
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}">`,
    `<rect width="${width}" height="${height}" fill="${ground}"/>`,
    ...shapes,
    '</svg>',
  ].join('');
}

/** For `<img src>`: a data URI keeps the SVG out of the DOM, so it cannot affect the page. */
export function artworkPlaceholderDataUri(slug: string, size?: PlaceholderSize): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(generateArtworkPlaceholderSvg(slug, size))}`;
}
