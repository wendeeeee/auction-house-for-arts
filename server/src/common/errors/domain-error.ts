import { ErrorCode } from './error-code';


export type ErrorDetails = Record<string, unknown>;


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
