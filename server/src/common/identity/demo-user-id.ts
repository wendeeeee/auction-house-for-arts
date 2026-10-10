const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type DemoUserIdClaim =
  | { readonly kind: 'anonymous' }
  | { readonly kind: 'claimed'; readonly userId: string }
  | { readonly kind: 'malformed' };

/**
 * The format rule for a presented demo identity, shared by the HTTP guard (`X-Demo-User-Id`)
 * and the Socket.IO handshake (`auth.demoUserId`), so both channels accept exactly the same
 * values. Absent or empty means anonymous. Anything else must be a UUID; it is checked here,
 * before any lookup, so garbage never reaches the database. A `claimed` ID still has to be
 * found in the users table.
 */
export function parseDemoUserIdClaim(value: unknown): DemoUserIdClaim {
  if (value === undefined || value === null || value === '') return { kind: 'anonymous' };
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) return { kind: 'malformed' };
  return { kind: 'claimed', userId: value.toLowerCase() };
}
