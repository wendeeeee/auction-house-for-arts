import { describe, expect, it } from 'vitest';
import type { ArtistView, ArtworkSummaryView } from '../../shared/api/api-types';
import { formatBasisPointsAsPercent } from '../../shared/format/basis-points';
import { computeCatalogFigures } from './catalog-figures';

function artwork(slug: string, medium: ArtworkSummaryView['medium'], saleType: ArtworkSummaryView['saleType']): ArtworkSummaryView {
  return { slug, title: slug, year: 2024, medium, dimensions: '1 × 1 cm', artist: { slug: 'a', name: 'A' }, saleType };
}

function artist(slug: string, royaltyBps: number): ArtistView {
  return { slug, name: slug, bio: '', royaltyBps };
}

describe('computeCatalogFigures', () => {
  it('counts works, artists, mediums, and resales from the data', () => {
    const figures = computeCatalogFigures(
      [artwork('one', 'Painting', 'primary'), artwork('two', 'Painting', 'resale'), artwork('three', 'Print', 'resale')],
      [artist('a', 500), artist('b', 1000)],
    );

    expect(figures).toMatchObject({
      workCount: 3,
      artistCount: 2,
      mediumsRepresented: 2,
      highestRoyaltyBps: 1000,
      resaleCount: 2,
    });
  });

  it('lists every medium in catalog order, with zero for empty ones', () => {
    const figures = computeCatalogFigures([artwork('one', 'Digital', 'primary')], []);

    expect(figures.byMedium).toEqual([
      { medium: 'Painting', workCount: 0 },
      { medium: 'Print', workCount: 0 },
      { medium: 'Photography', workCount: 0 },
      { medium: 'Sculpture', workCount: 0 },
      { medium: 'Drawing', workCount: 0 },
      { medium: 'Digital', workCount: 1 },
    ]);
  });

  it('has no highest royalty when there are no artists', () => {
    expect(computeCatalogFigures([], []).highestRoyaltyBps).toBeNull();
  });
});

describe('formatBasisPointsAsPercent', () => {
  it.each([
    [500, '5%'],
    [750, '7.5%'],
    [0, '0%'],
    [2000, '20%'],
  ])('%p bps → %s', (basisPoints, expected) => {
    expect(formatBasisPointsAsPercent(basisPoints)).toBe(expected);
  });
});
