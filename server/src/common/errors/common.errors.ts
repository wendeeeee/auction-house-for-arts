import { DomainError } from './domain-error';
import { ErrorCode } from './error-code';

export interface FieldError {
  readonly path: string;
  readonly message: string;
}

export class ValidationFailedError extends DomainError {
  readonly code = ErrorCode.VALIDATION_FAILED;
  readonly httpStatus = 400;

  constructor(fieldErrors: readonly FieldError[]) {
    super('Request validation failed.', { fieldErrors });
  }
}

export class InvalidAmountError extends DomainError {
  readonly code = ErrorCode.INVALID_AMOUNT;
  readonly httpStatus = 400;
}

/** No usable identity was presented. */
export class UnauthenticatedError extends DomainError {
  readonly code = ErrorCode.UNAUTHENTICATED;
  readonly httpStatus = 401;
}

/** Identified, but not allowed to do this. */
export class ForbiddenError extends DomainError {
  readonly code = ErrorCode.FORBIDDEN;
  readonly httpStatus = 403;
}

export class RouteNotFoundError extends DomainError {
  readonly code = ErrorCode.ROUTE_NOT_FOUND;
  readonly httpStatus = 404;
}

/**
 * A broken assumption in our own code.
 */
export class InvariantViolationError extends DomainError {
  readonly code = ErrorCode.INVARIANT_VIOLATION;
  readonly httpStatus = 500;
}
