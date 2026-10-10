import { CoverCandidate, resolveCoverImage } from './cover-image';

const image = (id: string, overrides: Partial<CoverCandidate> = {}) => ({
  id,
  status: 'ready' as const,
  position: 0,
  isCover: false,
  ...overrides,
});

describe('resolveCoverImage', () => {
  it('is the chosen cover', () => {
    const images = [image('a', { position: 0 }), image('b', { position: 1, isCover: true })];
    expect(resolveCoverImage(images)?.id).toBe('b');
  });

  it('falls back to the first ready image by position when none is chosen', () => {
    const images = [image('late', { position: 3 }), image('pending', { position: 0, status: 'pending' }), image('early', { position: 1 })];
    expect(resolveCoverImage(images)?.id).toBe('early');
  });

  it('is null when no image is ready', () => {
    expect(resolveCoverImage([image('a', { status: 'processing' }), image('b', { status: 'rejected' })])).toBeNull();
    expect(resolveCoverImage([])).toBeNull();
  });
});
