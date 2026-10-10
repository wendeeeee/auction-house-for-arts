import { parseDemoUserIdClaim } from './demo-user-id';

describe('parseDemoUserIdClaim', () => {
  it.each([undefined, null, ''])('treats %p as anonymous', (value) => {
    expect(parseDemoUserIdClaim(value)).toEqual({ kind: 'anonymous' });
  });

  it('claims a UUID, lower-cased so lookups match', () => {
    expect(parseDemoUserIdClaim('6F1E3C2A-0000-4000-8000-00000000000A')).toEqual({
      kind: 'claimed',
      userId: '6f1e3c2a-0000-4000-8000-00000000000a',
    });
  });

  it.each([['not-a-uuid'], [42], [['6f1e3c2a-0000-4000-8000-00000000000a']], [{ id: 'x' }], ['user:6f1e3c2a']])(
    'rejects %p as malformed',
    (value) => {
      expect(parseDemoUserIdClaim(value)).toEqual({ kind: 'malformed' });
    },
  );
});
