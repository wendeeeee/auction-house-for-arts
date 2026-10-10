import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { SEED_USERS } from '../../src/database/seed/seed-data';

/** The seeded user's ID by handle, failing loudly on a typo. */
export function seedUserId(handle: string): string {
  const user = SEED_USERS.find((candidate) => candidate.handle === handle);
  if (!user) throw new Error(`No seeded user with handle ${handle}`);
  return user.id;
}

const asUser = (handle: string | null): Record<string, string> =>
  handle === null ? {} : { 'x-demo-user-id': seedUserId(handle) };

export interface CreateAuctionRequest {
  readonly artworkSlug: string;
  readonly startingPriceCents: number;
  readonly reservePriceCents?: number;
  readonly endsAt: string;
}

/** Thin wrappers over `app.inject`, so specs read as the HTTP calls they make. */
export function auctionApi(app: NestFastifyApplication) {
  return {
    create: (sellerHandle: string | null, body: CreateAuctionRequest) =>
      app.inject({ method: 'POST', url: '/api/auctions', headers: asUser(sellerHandle), payload: body }),

    list: (queryString = '') => app.inject({ method: 'GET', url: `/api/auctions${queryString}` }),

    get: (slug: string, viewerHandle: string | null = null) =>
      app.inject({ method: 'GET', url: `/api/auctions/${slug}`, headers: asUser(viewerHandle) }),

    bid: (bidderHandle: string | null, slug: string, maxBidCents: unknown) =>
      app.inject({
        method: 'POST',
        url: `/api/auctions/${slug}/bids`,
        headers: asUser(bidderHandle),
        payload: { maxBidCents },
      }),
  };
}

/** Every object key anywhere in a JSON value, for asserting that a field never appears. */
export function collectKeys(value: unknown, keys: Set<string> = new Set()): Set<string> {
  if (Array.isArray(value)) {
    for (const item of value) collectKeys(item, keys);
  } else if (typeof value === 'object' && value !== null) {
    for (const [key, nested] of Object.entries(value)) {
      keys.add(key);
      collectKeys(nested, keys);
    }
  }
  return keys;
}
