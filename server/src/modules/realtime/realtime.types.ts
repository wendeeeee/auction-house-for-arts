/**
 * The real-time wire contract. Events are signals, not state: a client that receives one
 * refetches the auction over HTTP, so the database stays the only source of truth and a lost
 * or reordered event costs at most one stale render.
 */

/** Sent to `auction:{slug}` after every accepted bid on that auction. */
export const AUCTION_CHANGED_EVENT = 'auction:changed';

/** Sent to `user:{id}` when that user stops being the leader of an auction. */
export const USER_OUTBID_EVENT = 'user:outbid';

/** Sent to `user:{id}` by the worker, carrying the stored notification. */
export const NOTIFICATION_CREATED_EVENT = 'notification:created';

/** Sent to `auction:{slug}` once its outcome is recorded: a signal to refetch. */
export const AUCTION_CLOSED_EVENT = 'auction:closed';

export interface AuctionClosedEvent {
  readonly slug: string;
}

/** Client → server: start and stop receiving `auction:changed` for one auction. */
export const WATCH_AUCTION_MESSAGE = 'auction:watch';
export const UNWATCH_AUCTION_MESSAGE = 'auction:unwatch';

/**
 * What everyone watching sees. Only public figures: never a maximum, the reserve, or who
 * leads (the refetched detail shows the leader's handle, as it does for any viewer).
 * Wire names match the HTTP bid result (`extended`), so clients read both the same way.
 */
export interface AuctionChangedEvent {
  readonly slug: string;
  readonly priceCents: number;
  /** ISO 8601. Moves when a soft close extends the auction. */
  readonly endsAt: string;
  readonly extended: boolean;
}

/** What the previous leader sees, wherever they are in the app. */
export interface UserOutbidEvent {
  readonly slug: string;
  readonly artworkTitle: string;
  readonly priceCents: number;
}

/** A personal alert, addressed to one user. */
export interface UserOutbidNotice {
  readonly userId: string;
  readonly event: UserOutbidEvent;
}

/** Everything one accepted bid announces. */
export interface AuctionChangeAnnouncement {
  readonly auctionChanged: AuctionChangedEvent;
  readonly userOutbid: UserOutbidNotice | null;
}

export const auctionRoom = (slug: string): string => `auction:${slug}`;
export const userRoom = (userId: string): string => `user:${userId}`;

/** Per-connection state the server sets during the handshake. Clients never write it. */
export interface RealtimeSocketData {
  /** The verified demo user, or undefined for an anonymous viewer. */
  userId?: string;
}

/** The acknowledgement for `auction:watch` / `auction:unwatch`, shaped like the HTTP error contract. */
export type RealtimeAcknowledgement =
  | { readonly ok: true }
  | { readonly ok: false; readonly error: { readonly code: string; readonly message: string } };
