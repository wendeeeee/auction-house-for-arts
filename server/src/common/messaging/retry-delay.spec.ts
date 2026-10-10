import { computeRetryDelayMilliseconds } from './retry-delay';

describe('computeRetryDelayMilliseconds', () => {
  it('waits a second after the first failed delivery', () => {
    expect(computeRetryDelayMilliseconds(1)).toBe(1_000);
  });

  it('grows with each delivery', () => {
    expect(computeRetryDelayMilliseconds(2)).toBe(2_000);
    expect(computeRetryDelayMilliseconds(5)).toBe(5_000);
  });

  it('is capped at ten seconds', () => {
    expect(computeRetryDelayMilliseconds(11)).toBe(10_000);
    expect(computeRetryDelayMilliseconds(1_000)).toBe(10_000);
  });

  it('treats a missing or nonsensical count as the first delivery', () => {
    expect(computeRetryDelayMilliseconds(0)).toBe(1_000);
    expect(computeRetryDelayMilliseconds(-3)).toBe(1_000);
  });
});
