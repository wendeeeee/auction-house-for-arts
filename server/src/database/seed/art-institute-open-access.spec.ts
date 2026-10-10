import { OpenAccessResult, buildIiifImageUrl, buildOpenAccessSearchUrl, chooseOpenAccessResult } from './art-institute-open-access';

const result = (overrides: Partial<OpenAccessResult>): OpenAccessResult => ({
  id: 1,
  title: 'Landscape',
  artist_title: 'Jean Charles Cazin',
  classification_title: 'painting',
  image_id: 'image-1',
  is_public_domain: true,
  ...overrides,
});

describe('chooseOpenAccessResult', () => {
  it('takes the first public-domain result with an image and a matching classification', () => {
    const results = [
      result({ id: 1, image_id: null }),
      result({ id: 2, is_public_domain: false }),
      result({ id: 3, classification_title: 'earthenware' }),
      result({ id: 4, classification_title: 'Oil on canvas', image_id: 'image-4' }),
    ];
    expect(chooseOpenAccessResult(results, ['oil on'], new Set())?.id).toBe(4);
  });

  it('skips an image another artwork already uses', () => {
    const results = [result({ id: 1, image_id: 'used' }), result({ id: 2, image_id: 'fresh' })];
    expect(chooseOpenAccessResult(results, ['painting'], new Set(['used']))?.id).toBe(2);
  });

  it('is null when nothing fits', () => {
    expect(chooseOpenAccessResult([result({ classification_title: null })], ['painting'], new Set())).toBeNull();
  });
});

describe('open-access URLs', () => {
  it('searches public-domain works only', () => {
    const url = new URL(buildOpenAccessSearchUrl('trees woodcut', 20));
    expect(url.searchParams.get('q')).toBe('trees woodcut');
    expect(url.searchParams.get('query[term][is_public_domain]')).toBe('true');
    expect(url.searchParams.get('limit')).toBe('20');
  });

  it('asks the IIIF server for a given width', () => {
    expect(buildIiifImageUrl('3a34f988-f779', 1686)).toBe('https://www.artic.edu/iiif/2/3a34f988-f779/full/1686,/0/default.jpg');
  });
});
