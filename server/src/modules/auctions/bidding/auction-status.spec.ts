import { ErrorCode } from '../../../common/errors';
import { assertAuctionIsOpen, decideAuctionStatus } from './auction-status';

const endsAt = new Date('2026-03-01T18:00:00.000Z');
const offset = (milliseconds: number): Date => new Date(endsAt.getTime() + milliseconds);

describe('decideAuctionStatus', () => {
  it('is open until the instant it ends, and ended from that instant on', () => {
    expect(decideAuctionStatus({ endsAt, closedAt: null }, offset(-1))).toBe('open');
    expect(decideAuctionStatus({ endsAt, closedAt: null }, endsAt)).toBe('ended');
    expect(decideAuctionStatus({ endsAt, closedAt: null }, offset(1))).toBe('ended');
  });

  it('is ended once closed, even if ends_at is still in the future', () => {
    expect(decideAuctionStatus({ endsAt, closedAt: offset(-60_000) }, offset(-120_000))).toBe('ended');
  });
});

describe('assertAuctionIsOpen', () => {
  it('rejects a bid at exactly ends_at with AUCTION_ENDED', () => {
    expect(() => assertAuctionIsOpen({ endsAt, closedAt: null }, endsAt)).toThrow(
      expect.objectContaining({ code: ErrorCode.AUCTION_ENDED, details: { endsAt: endsAt.toISOString() } }),
    );
  });

  it('accepts a bid a millisecond before the end', () => {
    expect(() => assertAuctionIsOpen({ endsAt, closedAt: null }, offset(-1))).not.toThrow();
  });
});
