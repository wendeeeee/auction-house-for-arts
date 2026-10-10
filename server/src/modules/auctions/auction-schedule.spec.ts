import { decideAuctionEndProblem } from './auction-schedule';

const now = new Date('2026-03-01T12:00:00.000Z');
const secondsFromNow = (seconds: number): Date => new Date(now.getTime() + seconds * 1_000);
const DAY_SECONDS = 86_400;

describe('decideAuctionEndProblem', () => {
  it.each([
    ['exactly 2 minutes away', 120],
    ['a week away', 7 * DAY_SECONDS],
    ['exactly 14 days away', 14 * DAY_SECONDS],
  ])('accepts an end %s', (_case, seconds) => {
    expect(decideAuctionEndProblem(secondsFromNow(seconds), now)).toBeNull();
  });

  it.each([
    ['in the past', -60, 'must be at least 2 minutes from now'],
    ['a second short of 2 minutes', 119, 'must be at least 2 minutes from now'],
    ['a second past 14 days', 14 * DAY_SECONDS + 1, 'must be at most 14 days from now'],
  ])('rejects an end %s', (_case, seconds, problem) => {
    expect(decideAuctionEndProblem(secondsFromNow(seconds), now)).toBe(problem);
  });
});
