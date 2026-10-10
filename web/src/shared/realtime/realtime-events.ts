/** The server's real-time contract (server/src/modules/realtime/realtime.types.ts). */

export const AUCTION_CHANGED_EVENT = 'auction:changed';
export const USER_OUTBID_EVENT = 'user:outbid';
export const WATCH_AUCTION_MESSAGE = 'auction:watch';
export const UNWATCH_AUCTION_MESSAGE = 'auction:unwatch';

/** A signal to refetch the auction; the detail endpoint stays the source of truth. */
export interface AuctionChangedEvent {
  readonly slug: string;
  readonly priceCents: number;
  readonly endsAt: string;
  readonly extended: boolean;
}

export interface UserOutbidEvent {
  readonly slug: string;
  readonly artworkTitle: string;
  readonly priceCents: number;
}

/** A type alias (not an interface) so it is assignable to the socket's `Record<string, unknown>` auth. */
export type HandshakeAuth = {
  readonly demoUserId?: string;
};
