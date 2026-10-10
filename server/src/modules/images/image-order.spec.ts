import { decideImageOrder } from './image-order';

describe('decideImageOrder', () => {
  const current = ['a', 'b', 'c'];

  it('accepts any permutation of the current images', () => {
    expect(decideImageOrder(current, ['c', 'a', 'b'])).toEqual({ isValid: true });
    expect(decideImageOrder([], [])).toEqual({ isValid: true });
  });

  it('rejects an image listed twice', () => {
    expect(decideImageOrder(current, ['a', 'b', 'c', 'a'])).toEqual({ isValid: false, reason: 'duplicate', imageIds: ['a'] });
  });

  it('rejects an image that is not the artwork’s', () => {
    expect(decideImageOrder(current, ['a', 'b', 'c', 'z'])).toEqual({ isValid: false, reason: 'unknown', imageIds: ['z'] });
  });

  it('rejects an order that leaves an image out', () => {
    expect(decideImageOrder(current, ['c', 'a'])).toEqual({ isValid: false, reason: 'missing', imageIds: ['b'] });
  });
});
