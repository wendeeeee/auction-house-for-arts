import { ErrorCode } from './error-code';

/** Structured, client-safe context for an error. Part of the public error contract. */
export type ErrorDetails = Record<string, unknown>;

/**
 * Base of every error raised on purpose. Subclasses fix the stable `code` and the HTTP
 * status; the global exception filter turns them into
 * `{ error: { code, message, details, correlationId } }`.
 */
export abstract class DomainError extends Error {
  abstract readonly code: ErrorCode;
  abstract readonly httpStatus: number;

  constructor(
    message: string,
    readonly details: ErrorDetails = {},
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = new.target.name;
  }
}
