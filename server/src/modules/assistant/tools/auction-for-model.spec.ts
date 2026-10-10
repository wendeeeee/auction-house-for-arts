import { describeTimeLeft } from './auction-for-model';

describe('describeTimeLeft', () => {
  const now = new Date('2026-01-15T12:00:00.000Z');
  const later = (minutes: number) => new Date(now.getTime() + minutes * 60_000);

  it('reads days and hours, hours and minutes, or minutes', () => {
    expect(describeTimeLeft(later(2 * 1_440 + 5 * 60 + 7), now)).toBe('2d 5h');
    expect(describeTimeLeft(later(3 * 60 + 15), now)).toBe('3h 15m');
    expect(describeTimeLeft(later(9), now)).toBe('9m');
  });

  it('says ended at or after the end', () => {
    expect(describeTimeLeft(now, now)).toBe('ended');
    expect(describeTimeLeft(later(-5), now)).toBe('ended');
  });
});
