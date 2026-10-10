const API_BASE_URL = 'https://api.artic.edu/api/v1';
const IIIF_BASE_URL = 'https://www.artic.edu/iiif/2';

export interface OpenAccessSearch {
  readonly artworkSlug: string;
  readonly query: string;
  /** A result counts only if its classification contains one of these, so a painting gets a painting. */
  readonly classificationKeywords: readonly string[];
}

export interface OpenAccessResult {
  readonly id: number;
  readonly title: string;
  readonly artist_title: string | null;
  readonly classification_title: string | null;
  readonly image_id: string | null;
  readonly is_public_domain: boolean;
}

/** Illustrative stand-ins for the seeded works: public-domain (CC0) images from the Art Institute of Chicago. */
export const OPEN_ACCESS_SEARCHES: readonly OpenAccessSearch[] = [
  { artworkSlug: 'harmattan-light', query: 'landscape sunset', classificationKeywords: ['painting', 'oil on'] },
  { artworkSlug: 'lagos-at-dusk', query: 'harbor evening', classificationKeywords: ['painting', 'oil on', 'watercolor'] },
  { artworkSlug: 'study-of-hands', query: 'hands drawing', classificationKeywords: ['chalk', 'drawing', 'graphite'] },
  { artworkSlug: 'northern-silence', query: 'landscape photograph', classificationKeywords: ['albumen', 'gelatin silver', 'photograph'] },
  { artworkSlug: 'birch-woodcut-no-3', query: 'trees woodcut', classificationKeywords: ['woodcut'] },
  { artworkSlug: 'lighthouse-etching', query: 'harbor etching', classificationKeywords: ['etching'] },
  { artworkSlug: 'quiet-bronze', query: 'bronze figure', classificationKeywords: ['statuette', 'sculpture'] },
  { artworkSlug: 'desert-geometry', query: 'composition', classificationKeywords: ['painting', 'oil on canvas'] },
];

export function buildOpenAccessSearchUrl(query: string, limit: number): string {
  const parameters = new URLSearchParams({
    q: query,
    'query[term][is_public_domain]': 'true',
    limit: String(limit),
    fields: 'id,title,artist_title,classification_title,image_id,is_public_domain',
  });
  return `${API_BASE_URL}/artworks/search?${parameters.toString()}`;
}

export const buildIiifImageUrl = (imageId: string, width: number): string =>
  `${IIIF_BASE_URL}/${encodeURIComponent(imageId)}/full/${width},/0/default.jpg`;

/** The first public-domain result with an image, a matching classification, and an image not used yet. */
export function chooseOpenAccessResult(
  results: readonly OpenAccessResult[],
  classificationKeywords: readonly string[],
  usedImageIds: ReadonlySet<string>,
): (OpenAccessResult & { image_id: string }) | null {
  for (const result of results) {
    const classification = result.classification_title?.toLowerCase() ?? '';
    if (
      result.is_public_domain &&
      result.image_id !== null &&
      !usedImageIds.has(result.image_id) &&
      classificationKeywords.some((keyword) => classification.includes(keyword))
    ) {
      return { ...result, image_id: result.image_id };
    }
  }
  return null;
}
