/**
 * Stable error codes. Clients branch on these, never on the message, so a code is never
 * renamed or reused once shipped. Add new codes; do not edit old ones.
 */
export enum ErrorCode {
  // 400: the request itself is wrong
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  INVALID_AMOUNT = 'INVALID_AMOUNT',
  /** A payment-provider webhook whose signature does not verify against the raw body. */
  INVALID_WEBHOOK_SIGNATURE = 'INVALID_WEBHOOK_SIGNATURE',

  // 401 / 403 / 404
  UNAUTHENTICATED = 'UNAUTHENTICATED',
  FORBIDDEN = 'FORBIDDEN',
  ROUTE_NOT_FOUND = 'ROUTE_NOT_FOUND',
  /** Any other 4xx raised by the framework (unsupported media type, payload too large, …). */
  REQUEST_REJECTED = 'REQUEST_REJECTED',
  ARTWORK_NOT_FOUND = 'ARTWORK_NOT_FOUND',
  AUCTION_NOT_FOUND = 'AUCTION_NOT_FOUND',
  NOTIFICATION_NOT_FOUND = 'NOTIFICATION_NOT_FOUND',
  IMAGE_NOT_FOUND = 'IMAGE_NOT_FOUND',
  /** 403: only the artwork's current owner may put it up for auction. */
  NOT_ARTWORK_OWNER = 'NOT_ARTWORK_OWNER',
  /** 403: only the winner can pay for an auction. */
  NOT_AUCTION_WINNER = 'NOT_AUCTION_WINNER',
  /** 403: only the buyer and the seller can see a purchase. */
  NOT_PURCHASE_PARTY = 'NOT_PURCHASE_PARTY',
  /** 404: also the answer for another user's session, so its existence is not revealed. */
  ASSISTANT_SESSION_NOT_FOUND = 'ASSISTANT_SESSION_NOT_FOUND',
  /** 429: too many Concierge messages from one user in the current hour. */
  ASSISTANT_RATE_LIMITED = 'ASSISTANT_RATE_LIMITED',

  // 409: a business rule rejected an otherwise well-formed request
  BID_TOO_LOW = 'BID_TOO_LOW',
  AUCTION_ENDED = 'AUCTION_ENDED',
  NOT_ALLOWED_TO_BID = 'NOT_ALLOWED_TO_BID',
  MAX_NOT_RAISED = 'MAX_NOT_RAISED',
  ARTWORK_ALREADY_AT_AUCTION = 'ARTWORK_ALREADY_AT_AUCTION',
  /** Socket.IO only: a connection asked to watch more auctions than the per-connection cap. */
  TOO_MANY_WATCHED_AUCTIONS = 'TOO_MANY_WATCHED_AUCTIONS',
  /** A ledger transaction already exists for this purchase: it was paid out once already. */
  PURCHASE_ALREADY_POSTED = 'PURCHASE_ALREADY_POSTED',
  AUCTION_NOT_SOLD = 'AUCTION_NOT_SOLD',
  PURCHASE_ALREADY_PAID = 'PURCHASE_ALREADY_PAID',
  /** The buyer completed checkout; the provider's confirmation has not arrived yet. */
  PAYMENT_IN_PROGRESS = 'PAYMENT_IN_PROGRESS',
  /** Pending, processing, and ready images all count; rejected ones do not. */
  IMAGE_LIMIT_REACHED = 'IMAGE_LIMIT_REACHED',
  /** Only a processed image can be the cover. */
  IMAGE_NOT_READY = 'IMAGE_NOT_READY',
  /** A reorder must list every image of the artwork exactly once. */
  INVALID_IMAGE_ORDER = 'INVALID_IMAGE_ORDER',

  // 500: our bug, never the client's fault
  INVARIANT_VIOLATION = 'INVARIANT_VIOLATION',
  /** A ledger posting that does not balance, or is otherwise malformed. Always our bug. */
  INVALID_LEDGER_POSTING = 'INVALID_LEDGER_POSTING',
  INTERNAL_ERROR = 'INTERNAL_ERROR',

  // 502 / 503: a dependency failed or is not set up
  /** 502: the payment provider answered with an error or could not be reached. */
  PAYMENT_PROVIDER_ERROR = 'PAYMENT_PROVIDER_ERROR',
  /** 503: no payment provider is configured (no Stripe keys); everything else still works. */
  PAYMENTS_UNAVAILABLE = 'PAYMENTS_UNAVAILABLE',
  /** 503: no language model is configured, or the model call failed. Search still works on keywords. */
  ASSISTANT_UNAVAILABLE = 'ASSISTANT_UNAVAILABLE',
}
