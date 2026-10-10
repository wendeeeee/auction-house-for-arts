/**
 * Stable error codes. Clients branch on these, never on the message, so a code is never
 * renamed or reused once shipped. Add new codes; do not edit old ones.
 */
export enum ErrorCode {
  // 400: the request itself is wrong
  VALIDATION_FAILED = 'VALIDATION_FAILED',
  INVALID_AMOUNT = 'INVALID_AMOUNT',

  // 401 / 403 / 404
  UNAUTHENTICATED = 'UNAUTHENTICATED',
  FORBIDDEN = 'FORBIDDEN',
  ROUTE_NOT_FOUND = 'ROUTE_NOT_FOUND',
  /** Any other 4xx raised by the framework (unsupported media type, payload too large, …). */
  REQUEST_REJECTED = 'REQUEST_REJECTED',
  ARTWORK_NOT_FOUND = 'ARTWORK_NOT_FOUND',
  AUCTION_NOT_FOUND = 'AUCTION_NOT_FOUND',
  NOTIFICATION_NOT_FOUND = 'NOTIFICATION_NOT_FOUND',
  /** 403: only the artwork's current owner may put it up for auction. */
  NOT_ARTWORK_OWNER = 'NOT_ARTWORK_OWNER',

  // 409: a business rule rejected an otherwise well-formed request
  BID_TOO_LOW = 'BID_TOO_LOW',
  AUCTION_ENDED = 'AUCTION_ENDED',
  NOT_ALLOWED_TO_BID = 'NOT_ALLOWED_TO_BID',
  MAX_NOT_RAISED = 'MAX_NOT_RAISED',
  ARTWORK_ALREADY_AT_AUCTION = 'ARTWORK_ALREADY_AT_AUCTION',
  /** Socket.IO only: a connection asked to watch more auctions than the per-connection cap. */
  TOO_MANY_WATCHED_AUCTIONS = 'TOO_MANY_WATCHED_AUCTIONS',

  // 500: our bug, never the client's fault
  INVARIANT_VIOLATION = 'INVARIANT_VIOLATION',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}
