import { demoUserStore } from '../session/demo-user-store';
import { ApiError, CLIENT_ERROR_CODES } from './api-error';

export const DEMO_USER_HEADER = 'X-Demo-User-Id';

export type QueryParameters = Record<string, string | number | null | undefined>;

export interface ApiClientOptions {
  readonly baseUrl?: string;
  readonly fetchImplementation?: typeof fetch;
  /** The demo user to act as, read on every request so switching users takes effect at once. */
  readonly getDemoUserId?: () => string | null;
}

export interface RequestOptions {
  readonly query?: QueryParameters;
  readonly signal?: AbortSignal;
}

export interface ApiClient {
  get<T>(path: string, options?: RequestOptions): Promise<T>;
  /** Sends `body` as JSON. */
  post<T>(path: string, body: unknown, options?: RequestOptions): Promise<T>;
  put<T>(path: string, body: unknown, options?: RequestOptions): Promise<T>;
  /** Resolves with undefined on 204 No Content. */
  delete<T = void>(path: string, options?: RequestOptions): Promise<T>;
}

export function createApiClient(options: ApiClientOptions = {}): ApiClient {
  const baseUrl = options.baseUrl ?? '/api';
  const getDemoUserId = options.getDemoUserId ?? (() => null);

  async function request<T>(
    method: string,
    path: string,
    requestOptions: RequestOptions = {},
    body?: unknown,
  ): Promise<T> {
    // Looked up per call (not captured at creation) so tests can stub the global fetch.
    const fetchImplementation = options.fetchImplementation ?? globalThis.fetch;
    const headers: Record<string, string> = { Accept: 'application/json' };
    const demoUserId = getDemoUserId();
    if (demoUserId) headers[DEMO_USER_HEADER] = demoUserId;
    if (body !== undefined) headers['Content-Type'] = 'application/json';

    let response: Response;
    try {
      response = await fetchImplementation(`${baseUrl}${path}${toQueryString(requestOptions.query)}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: requestOptions.signal,
      });
    } catch (error) {
      // A cancelled request is not a failure to show; let the caller see the AbortError.
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      throw new ApiError(0, CLIENT_ERROR_CODES.NETWORK_ERROR, 'Could not reach the server.', {}, null);
    }

    if (response.status === 204) return undefined as T;
    if (response.ok) return (await response.json()) as T;
    throw await toApiError(response);
  }

  return {
    get: (path, requestOptions) => request('GET', path, requestOptions),
    post: (path, body, requestOptions) => request('POST', path, requestOptions, body),
    put: (path, body, requestOptions) => request('PUT', path, requestOptions, body),
    delete: (path, requestOptions) => request('DELETE', path, requestOptions),
  };
}

/** Blank and missing values are left out, so `?medium=` never reaches the server. */
export function toQueryString(query: QueryParameters | undefined): string {
  if (!query) return '';
  const parameters = new URLSearchParams();
  for (const [name, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    parameters.set(name, String(value));
  }
  const text = parameters.toString();
  return text ? `?${text}` : '';
}

interface ErrorBody {
  error?: { code?: unknown; message?: unknown; details?: unknown; correlationId?: unknown };
}

/** Reads the server's error contract; anything else (an HTML proxy page, a crash) becomes UNEXPECTED_RESPONSE. */
async function toApiError(response: Response): Promise<ApiError> {
  const fallbackCorrelationId = response.headers.get('x-request-id');
  let body: ErrorBody | undefined;
  try {
    body = (await response.json()) as ErrorBody;
  } catch {
    body = undefined;
  }

  const error = body?.error;
  if (error && typeof error.code === 'string' && typeof error.message === 'string') {
    return new ApiError(
      response.status,
      error.code,
      error.message,
      isRecord(error.details) ? error.details : {},
      typeof error.correlationId === 'string' ? error.correlationId : fallbackCorrelationId,
    );
  }
  return new ApiError(
    response.status,
    CLIENT_ERROR_CODES.UNEXPECTED_RESPONSE,
    `The server answered with an unexpected response (${response.status}).`,
    {},
    fallbackCorrelationId,
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** The app's client: acts as the user chosen in the demo user switcher. */
export const apiClient = createApiClient({ getDemoUserId: () => demoUserStore.get() });
