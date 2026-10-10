/**
 * Demo catalog. IDs are fixed so the seed is safe to re-run (`ON CONFLICT DO NOTHING`) and so
 * a demo user ID stays valid across database resets (the web app remembers the chosen user).
 * All people and works are fictional.
 */

export interface SeedUser {
  readonly id: string;
  readonly displayName: string;
  readonly handle: string;
}

export interface SeedArtist {
  readonly id: string;
  readonly userId: string;
  readonly slug: string;
  readonly name: string;
  readonly bio: string;
  readonly royaltyBps: number;
}

export interface SeedArtwork {
  readonly id: string;
  readonly slug: string;
  readonly artistId: string;
  readonly title: string;
  readonly year: number | null;
  readonly medium: 'Painting' | 'Print' | 'Photography' | 'Sculpture' | 'Drawing' | 'Digital';
  readonly dimensions: string;
  readonly description: string;
  readonly ownerUserId: string;
  /** Fixed, so the newest-first catalog order is the same on every machine. */
  readonly createdAt: string;
}

const userId = (number: number): string => `5eed0000-0000-4000-8000-0000000000${String(number).padStart(2, '0')}`;
const artistId = (number: number): string => `5eed0000-0000-4000-8000-0000000a00${String(number).padStart(2, '0')}`;
const artworkId = (number: number): string => `5eed0000-0000-4000-8000-0000000b00${String(number).padStart(2, '0')}`;

export const SEED_USERS: readonly SeedUser[] = [
  // Artists (each also has an artist profile below)
  { id: userId(1), displayName: 'Amara Okafor', handle: 'amara_okafor' },
  { id: userId(2), displayName: 'Tomás Lindqvist', handle: 'tomas_lindqvist' },
  { id: userId(3), displayName: 'Mei Tanaka', handle: 'mei_tanaka' },
  { id: userId(4), displayName: 'Rafael Ortiz', handle: 'rafael_ortiz' },
  // Collectors
  { id: userId(5), displayName: 'Ada Mensah', handle: 'ada_mensah' },
  { id: userId(6), displayName: 'Bianca Rossi', handle: 'bianca_rossi' },
  { id: userId(7), displayName: 'Chidi Nwosu', handle: 'chidi_nwosu' },
  { id: userId(8), displayName: 'Dmitri Volkov', handle: 'dmitri_volkov' },
  { id: userId(9), displayName: 'Elena Park', handle: 'elena_park' },
  { id: userId(10), displayName: 'Farah Haddad', handle: 'farah_haddad' },
];

export const SEED_ARTISTS: readonly SeedArtist[] = [
  {
    id: artistId(1),
    userId: userId(1),
    slug: 'amara-okafor',
    name: 'Amara Okafor',
    bio: 'Lagos-born painter working in oil and charcoal. Light, heat, and crowded markets.',
    royaltyBps: 500,
  },
  {
    id: artistId(2),
    userId: userId(2),
    slug: 'tomas-lindqvist',
    name: 'Tomás Lindqvist',
    bio: 'Photographer and printmaker from the Swedish coast. Long exposures, woodcuts, and winter.',
    royaltyBps: 750,
  },
  {
    id: artistId(3),
    userId: userId(3),
    slug: 'mei-tanaka',
    name: 'Mei Tanaka',
    bio: 'Sculptor in stoneware and bronze who also writes generative software for screens.',
    royaltyBps: 1000,
  },
  {
    id: artistId(4),
    userId: userId(4),
    slug: 'rafael-ortiz',
    name: 'Rafael Ortiz',
    bio: 'Painter, screen printer, and street photographer from the high desert.',
    royaltyBps: 500,
  },
];

const createdAt = (daysBeforeLaunch: number): string =>
  new Date(Date.UTC(2026, 0, 31) - daysBeforeLaunch * 86_400_000).toISOString();

export const SEED_ARTWORKS: readonly SeedArtwork[] = [
  {
    id: artworkId(1),
    slug: 'harmattan-light',
    artistId: artistId(1),
    title: 'Harmattan Light',
    year: 2023,
    medium: 'Painting',
    dimensions: '120 × 90 cm',
    description: 'Oil on linen. Dust-softened afternoon sun over a rooftop in December.',
    ownerUserId: userId(1),
    createdAt: createdAt(1),
  },
  {
    id: artworkId(2),
    slug: 'lagos-at-dusk',
    artistId: artistId(1),
    title: 'Lagos at Dusk',
    year: 2021,
    medium: 'Painting',
    dimensions: '100 × 150 cm',
    description: 'Oil on canvas. The lagoon bridge as traffic lights come on.',
    ownerUserId: userId(6),
    createdAt: createdAt(2),
  },
  {
    id: artworkId(3),
    slug: 'study-of-hands',
    artistId: artistId(1),
    title: 'Study of Hands',
    year: 2022,
    medium: 'Drawing',
    dimensions: '42 × 59.4 cm',
    description: 'Charcoal on paper. Six studies of a tailor’s hands at work.',
    ownerUserId: userId(1),
    createdAt: createdAt(3),
  },
  {
    id: artworkId(4),
    slug: 'market-women-sketchbook',
    artistId: artistId(1),
    title: 'Market Women, Sketchbook Page',
    year: 2019,
    medium: 'Drawing',
    dimensions: '29.7 × 42 cm',
    description: 'Ink and wash. A single page from the Balogun market sketchbook.',
    ownerUserId: userId(7),
    createdAt: createdAt(4),
  },
  {
    id: artworkId(5),
    slug: 'northern-silence',
    artistId: artistId(2),
    title: 'Northern Silence',
    year: 2020,
    medium: 'Photography',
    dimensions: '80 × 120 cm',
    description: 'Archival pigment print, edition 2 of 5. A frozen inlet at 3 a.m.',
    ownerUserId: userId(2),
    createdAt: createdAt(5),
  },
  {
    id: artworkId(6),
    slug: 'frozen-harbour',
    artistId: artistId(2),
    title: 'Frozen Harbour',
    year: 2018,
    medium: 'Photography',
    dimensions: '60 × 90 cm',
    description: 'Archival pigment print, edition 4 of 5. Fishing boats locked in ice.',
    ownerUserId: userId(5),
    createdAt: createdAt(6),
  },
  {
    id: artworkId(7),
    slug: 'birch-woodcut-no-3',
    artistId: artistId(2),
    title: 'Birch, Woodcut No. 3',
    year: 2022,
    medium: 'Print',
    dimensions: '50 × 70 cm',
    description: 'Woodcut on Japanese paper, edition of 12.',
    ownerUserId: userId(2),
    createdAt: createdAt(7),
  },
  {
    id: artworkId(8),
    slug: 'lighthouse-etching',
    artistId: artistId(2),
    title: 'Lighthouse, Etching',
    year: 2017,
    medium: 'Print',
    dimensions: '30 × 40 cm',
    description: 'Copper-plate etching with aquatint, edition of 20.',
    ownerUserId: userId(9),
    createdAt: createdAt(8),
  },
  {
    id: artworkId(9),
    slug: 'tide-vessel',
    artistId: artistId(3),
    title: 'Tide Vessel',
    year: 2023,
    medium: 'Sculpture',
    dimensions: '45 × 30 × 30 cm',
    description: 'Wood-fired stoneware with a celadon glaze pooled like low water.',
    ownerUserId: userId(3),
    createdAt: createdAt(9),
  },
  {
    id: artworkId(10),
    slug: 'quiet-bronze',
    artistId: artistId(3),
    title: 'Quiet Bronze',
    year: 2016,
    medium: 'Sculpture',
    dimensions: '60 × 20 × 20 cm',
    description: 'Cast bronze, patinated. A standing figure, eyes closed.',
    ownerUserId: userId(8),
    createdAt: createdAt(10),
  },
  {
    id: artworkId(11),
    slug: 'signal-garden',
    artistId: artistId(3),
    title: 'Signal Garden',
    year: 2024,
    medium: 'Digital',
    dimensions: '3840 × 2160 px',
    description: 'Generative animation, unique. Grows a new garden from each day’s weather.',
    ownerUserId: userId(3),
    createdAt: createdAt(11),
  },
  {
    id: artworkId(12),
    slug: 'paper-cranes-in-motion',
    artistId: artistId(3),
    title: 'Paper Cranes in Motion',
    year: 2022,
    medium: 'Digital',
    dimensions: '2160 × 2160 px',
    description: 'Looping 3D render, edition of 10.',
    ownerUserId: userId(3),
    createdAt: createdAt(12),
  },
  {
    id: artworkId(13),
    slug: 'desert-geometry',
    artistId: artistId(4),
    title: 'Desert Geometry',
    year: 2024,
    medium: 'Painting',
    dimensions: '90 × 90 cm',
    description: 'Acrylic on panel. Mesa shadows reduced to interlocking planes.',
    ownerUserId: userId(4),
    createdAt: createdAt(13),
  },
  {
    id: artworkId(14),
    slug: 'blue-hour-serigraph',
    artistId: artistId(4),
    title: 'Blue Hour, Serigraph',
    year: 2023,
    medium: 'Print',
    dimensions: '56 × 76 cm',
    description: 'Seven-color screen print, edition of 30.',
    ownerUserId: userId(4),
    createdAt: createdAt(14),
  },
  {
    id: artworkId(15),
    slug: 'mercado-portraits',
    artistId: artistId(4),
    title: 'Mercado Portraits',
    year: 2021,
    medium: 'Photography',
    dimensions: '40 × 50 cm (set of 3)',
    description: 'Silver gelatin prints. Vendors at a Saturday market.',
    ownerUserId: userId(10),
    createdAt: createdAt(15),
  },
  {
    id: artworkId(16),
    slug: 'adobe-wall-study',
    artistId: artistId(4),
    title: 'Adobe Wall Study',
    year: null,
    medium: 'Drawing',
    dimensions: '30 × 30 cm',
    description: 'Graphite and pastel. Undated studio study.',
    ownerUserId: userId(4),
    createdAt: createdAt(16),
  },
];
