import { HttpException } from '@nestjs/common';
import { DomainError, ErrorCode, ErrorDetails } from '../errors';

/** The public error contract. Clients branch on `code`; `message` is for people. */
export interface ErrorResponseBody {
  readonly error: {
    readonly code: ErrorCode;
    readonly message: string;
    readonly details: ErrorDetails;
    readonly correlationId: string | null;
  };
}

export interface ErrorResponse {
  readonly status: number;
  readonly body: ErrorResponseBody;
  /** Our fault: log it with its stack. */
  readonly isServerError: boolean;
}

export const GENERIC_SERVER_ERROR_MESSAGE = 'An unexpected error occurred.';

const FRAMEWORK_STATUS_CODES: Readonly<Record<number, ErrorCode>> = {
  400: ErrorCode.VALIDATION_FAILED,
  401: ErrorCode.UNAUTHENTICATED,
  403: ErrorCode.FORBIDDEN,
  404: ErrorCode.ROUTE_NOT_FOUND,
};

/**
 * Maps anything thrown to the error contract. Pure, so every branch is unit-tested.
 *
 * Never leaks internals: anything that is our fault (an unknown error, a 500 DomainError such
 * as an invariant violation) goes out as INTERNAL_ERROR with a generic message and no details.
 * The real error goes to the log, findable by the same correlation ID.
 */
export function buildErrorResponse(exception: unknown, correlationId: string | null): ErrorResponse {
  if (exception instanceof DomainError && exception.httpStatus !== 500) {
    return {
      status: exception.httpStatus,
      isServerError: exception.httpStatus >= 500,
      body: errorBody(exception.code, exception.message, exception.details, correlationId),
    };
  }

  const frameworkStatus = clientErrorStatusOf(exception);
  if (frameworkStatus !== undefined) {
    return {
      status: frameworkStatus,
      isServerError: false,
      body: errorBody(
        FRAMEWORK_STATUS_CODES[frameworkStatus] ?? ErrorCode.REQUEST_REJECTED,
        (exception as Error).message,
        {},
        correlationId,
      ),
    };
  }

  return {
    status: 500,
    isServerError: true,
    body: errorBody(ErrorCode.INTERNAL_ERROR, GENERIC_SERVER_ERROR_MESSAGE, {}, correlationId),
  };
}

function errorBody(
  code: ErrorCode,
  message: string,
  details: ErrorDetails,
  correlationId: string | null,
): ErrorResponseBody {
  return { error: { code, message, details, correlationId } };
}

/**
 * The 4xx status of an error raised by Nest (`NotFoundException` for an unknown route) or by
 * Fastify before routing (`FST_ERR_CTP_INVALID_MEDIA_TYPE` carries `statusCode: 415`).
 * Anything 5xx is treated as unknown, so its message is never sent.
 */
function clientErrorStatusOf(exception: unknown): number | undefined {
  let status: unknown;
  if (exception instanceof HttpException) {
    status = exception.getStatus();
  } else if (exception instanceof Error && 'statusCode' in exception) {
    status = exception.statusCode;
  }
  return typeof status === 'number' && status >= 400 && status < 500 ? status : undefined;
}
