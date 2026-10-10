import { ErrorCode } from '../../../common/errors';
import { decideSoftCloseExtension } from './soft-close';

const endsAt = new Date('2026-03-01T18:00:00.000Z');
const secondsBeforeEnd = (seconds: number): Date => new Date(endsAt.getTime() - seconds * 1_000);

describe('decideSoftCloseExtension', () => {
  it('extends to bid time + window when a visible change lands inside the window', () => {
    const acceptedAt = secondsBeforeEnd(30);

    expect(
      decideSoftCloseExtension({ endsAt, acceptedAt, windowSeconds: 120, isPriceOrLeaderChanged: true }),
    ).toEqual({ endsAt: new Date(acceptedAt.getTime() + 120_000), isExtended: true });
  });

  it('extends a bid in the last millisecond', () => {
    const acceptedAt = new Date(endsAt.getTime() - 1);

    expect(decideSoftCloseExtension({ endsAt, acceptedAt, windowSeconds: 120, isPriceOrLeaderChanged: true }).isExtended).toBe(
      true,
    );
  });

  it('does not extend with exactly the window left: the others already have a full window', () => {
    expect(
      decideSoftCloseExtension({
        endsAt,
        acceptedAt: secondsBeforeEnd(120),
        windowSeconds: 120,
        isPriceOrLeaderChanged: true,
      }),
    ).toEqual({ endsAt, isExtended: false });
  });

  it('does not extend a bid well before the window', () => {
    expect(
      decideSoftCloseExtension({ endsAt, acceptedAt: secondsBeforeEnd(600), windowSeconds: 120, isPriceOrLeaderChanged: true })
        .isExtended,
    ).toBe(false);
  });

  it('does not extend for a leader’s self-raise that changes nothing visible, even inside the window', () => {
    expect(
      decideSoftCloseExtension({ endsAt, acceptedAt: secondsBeforeEnd(10), windowSeconds: 120, isPriceOrLeaderChanged: false }),
    ).toEqual({ endsAt, isExtended: false });
  });

  it('refuses to consider a bid at or after the end', () => {
    expect(() =>
      decideSoftCloseExtension({ endsAt, acceptedAt: endsAt, windowSeconds: 120, isPriceOrLeaderChanged: true }),
    ).toThrow(expect.objectContaining({ code: ErrorCode.INVARIANT_VIOLATION }));
  });
});
