import { describe, expect, it } from 'vitest';
import { describeTimeRemaining } from './time-remaining';

const endsAt = new Date('2026-03-01T18:00:00.000Z');
const before = (milliseconds: number): Date => new Date(endsAt.getTime() - milliseconds);

describe('describeTimeRemaining', () => {
  it.each([
    [(2 * 86_400 + 3 * 3_600 + 59) * 1_000, '2d 3h'],
    [(3_600 + 5 * 60) * 1_000, '1h 05m'],
    [(4 * 60 + 9) * 1_000, '4m 09s'],
    [9_000, '9s'],
    [1, '1s'],
  ])('%i ms before the end reads %s', (milliseconds, label) => {
    expect(describeTimeRemaining(endsAt, before(milliseconds)).label).toBe(label);
  });

  it('has ended from the instant ends_at arrives', () => {
    expect(describeTimeRemaining(endsAt, endsAt)).toEqual({ hasEnded: true, label: 'Ended', isEndingSoon: false });
    expect(describeTimeRemaining(endsAt, before(-5_000)).hasEnded).toBe(true);
  });

  it('flags the last five minutes', () => {
    expect(describeTimeRemaining(endsAt, before(5 * 60_000)).isEndingSoon).toBe(true);
    expect(describeTimeRemaining(endsAt, before(5 * 60_000 + 1_000)).isEndingSoon).toBe(false);
  });
});
