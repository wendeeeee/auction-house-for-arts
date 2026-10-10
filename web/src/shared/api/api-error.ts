/** Codes the client produces itself, when there is no server error body to read. */
export const CLIENT_ERROR_CODES = {
  NETWORK_ERROR: 'NETWORK_ERROR',
  UNEXPECTED_RESPONSE: 'UNEXPECTED_RESPONSE',
} as const;

/**
 * A failed API call, typed. Mirrors the server's error contract
 * `{ error: { code, message, details, correlationId } }`, so UI code branches on `code`.
 */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details: Record<string, unknown>,
    readonly correlationId: string | null,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export function isApiErrorWithCode(error: unknown, code: string): error is ApiError {
  return error instanceof ApiError && error.code === code;
}
