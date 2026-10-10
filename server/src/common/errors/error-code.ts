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

  // 500: our bug, never the client's fault
  INVARIANT_VIOLATION = 'INVARIANT_VIOLATION',
  INTERNAL_ERROR = 'INTERNAL_ERROR',
}
