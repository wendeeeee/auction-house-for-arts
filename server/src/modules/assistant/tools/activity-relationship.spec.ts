import { decideActivityRelationship } from './activity-relationship';

const base = { userId: 'me', sellerUserId: 'seller', leaderUserId: 'me', status: 'open' as const, close: null };

describe('decideActivityRelationship', () => {
  it('reports selling for the seller, whatever else is true', () => {
    expect(decideActivityRelationship({ ...base, userId: 'seller' })).toBe('selling');
  });

  it('reports leading or outbid while open', () => {
    expect(decideActivityRelationship(base)).toBe('leading');
    expect(decideActivityRelationship({ ...base, leaderUserId: 'someone' })).toBe('outbid');
  });

  it('waits for the recorded outcome after the end', () => {
    expect(decideActivityRelationship({ ...base, status: 'ended' })).toBe('awaiting_result');
  });

  it('reads the recorded outcome', () => {
    const ended = { ...base, status: 'ended' as const };
    expect(decideActivityRelationship({ ...ended, close: { outcome: 'sold', winningUserId: 'me' } })).toBe('won');
    expect(decideActivityRelationship({ ...ended, leaderUserId: 'other', close: { outcome: 'sold', winningUserId: 'other' } })).toBe('lost');
    expect(decideActivityRelationship({ ...ended, close: { outcome: 'reserve_not_met', winningUserId: null } })).toBe('reserve_not_met');
    expect(
      decideActivityRelationship({ ...ended, leaderUserId: 'other', close: { outcome: 'reserve_not_met', winningUserId: null } }),
    ).toBe('lost');
  });
});
