import { describe, expect, it, vi } from 'vitest';
import { ApiError, isApiErrorWithCode } from './api-error';
import { createApiClient, toQueryString } from './api-client';

const DEMO_USER_ID = '5eed0000-0000-4000-8000-000000000005';

function jsonResponse(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}

function clientReturning(response: Response | Error, demoUserId: string | null = null) {
  const fetchImplementation = vi.fn<typeof fetch>(async () => {
    if (response instanceof Error) throw response;
    return response;
  });
  const client = createApiClient({ fetchImplementation, getDemoUserId: () => demoUserId });
  return { client, fetchImplementation };
}

function sentHeaders(fetchImplementation: ReturnType<typeof clientReturning>['fetchImplementation']): Record<string, string> {
  const init = fetchImplementation.mock.calls[0]?.[1];
  return (init?.headers ?? {}) as Record<string, string>;
}

async function rejectionOf(promise: Promise<unknown>): Promise<ApiError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof ApiError) return error;
    throw error;
  }
  throw new Error('expected the request to fail');
}

describe('api client', () => {
  describe('demo user header', () => {
    it('sends X-Demo-User-Id when a demo user is chosen', async () => {
      const { client, fetchImplementation } = clientReturning(jsonResponse(200, { items: [] }), DEMO_USER_ID);

      await client.get('/artworks');

      expect(sentHeaders(fetchImplementation)['X-Demo-User-Id']).toBe(DEMO_USER_ID);
    });

    it('omits the header when browsing anonymously', async () => {
      const { client, fetchImplementation } = clientReturning(jsonResponse(200, { items: [] }));

      await client.get('/artworks');

      expect(sentHeaders(fetchImplementation)).not.toHaveProperty('X-Demo-User-Id');
    });

    it('reads the current user on every request, so a switch applies immediately', async () => {
      let currentUser: string | null = null;
      const fetchImplementation = vi.fn<typeof fetch>(async () => jsonResponse(200, {}));
      const client = createApiClient({ fetchImplementation, getDemoUserId: () => currentUser });

      await client.get('/users/me');
      currentUser = DEMO_USER_ID;
      await client.get('/users/me');

      const headersOf = (call: number) => (fetchImplementation.mock.calls[call]?.[1]?.headers ?? {}) as Record<string, string>;
      expect(headersOf(0)['X-Demo-User-Id']).toBeUndefined();
      expect(headersOf(1)['X-Demo-User-Id']).toBe(DEMO_USER_ID);
    });
  });

  it('builds the URL from the base, the path, and non-blank query values', async () => {
    const { client, fetchImplementation } = clientReturning(jsonResponse(200, { items: [] }));

    await client.get('/artworks', { query: { medium: 'Print', query: '', artist: undefined, limit: 20 } });

    expect(fetchImplementation.mock.calls[0]?.[0]).toBe('/api/artworks?medium=Print&limit=20');
  });

  it('posts a JSON body with the demo user header', async () => {
    const { client, fetchImplementation } = clientReturning(jsonResponse(201, { leading: true }), DEMO_USER_ID);

    await expect(client.post('/auctions/tide-vessel-abc123/bids', { maxBidCents: 500_00 })).resolves.toEqual({
      leading: true,
    });

    const [url, init] = fetchImplementation.mock.calls[0] ?? [];
    expect(url).toBe('/api/auctions/tide-vessel-abc123/bids');
    expect(init?.method).toBe('POST');
    expect(init?.body).toBe('{"maxBidCents":50000}');
    expect(sentHeaders(fetchImplementation)).toMatchObject({
      'Content-Type': 'application/json',
      'X-Demo-User-Id': DEMO_USER_ID,
    });
  });

  it('sends no body or content type on a GET', async () => {
    const { client, fetchImplementation } = clientReturning(jsonResponse(200, {}));

    await client.get('/auctions');

    expect(fetchImplementation.mock.calls[0]?.[1]?.body).toBeUndefined();
    expect(sentHeaders(fetchImplementation)).not.toHaveProperty('Content-Type');
  });

  it('sends a PUT with a JSON body', async () => {
    const { client, fetchImplementation } = clientReturning(jsonResponse(200, { items: [] }));

    await client.put('/artworks/tide-vessel/images/order', { imageIds: ['a'] });

    expect(fetchImplementation.mock.calls[0]?.[1]?.method).toBe('PUT');
    expect(fetchImplementation.mock.calls[0]?.[1]?.body).toBe('{"imageIds":["a"]}');
  });

  it('resolves a DELETE answered with 204 No Content to undefined', async () => {
    const { client, fetchImplementation } = clientReturning(new Response(null, { status: 204 }));

    await expect(client.delete('/artworks/tide-vessel/images/a')).resolves.toBeUndefined();
    expect(fetchImplementation.mock.calls[0]?.[1]?.method).toBe('DELETE');
  });

  it('returns the parsed body on success', async () => {
    const { client } = clientReturning(jsonResponse(200, { items: [{ slug: 'tide-vessel' }] }));

    await expect(client.get('/artworks')).resolves.toEqual({ items: [{ slug: 'tide-vessel' }] });
  });

  describe('error mapping', () => {
    it('turns the error contract into a typed ApiError', async () => {
      const { client } = clientReturning(
        jsonResponse(404, {
          error: {
            code: 'ARTWORK_NOT_FOUND',
            message: 'No artwork with slug "nope".',
            details: { slug: 'nope' },
            correlationId: 'request-0001',
          },
        }),
      );

      const error = await rejectionOf(client.get('/artworks/nope'));

      expect(error).toMatchObject({
        status: 404,
        code: 'ARTWORK_NOT_FOUND',
        message: 'No artwork with slug "nope".',
        details: { slug: 'nope' },
        correlationId: 'request-0001',
      });
      expect(isApiErrorWithCode(error, 'ARTWORK_NOT_FOUND')).toBe(true);
    });

    it('maps a non-contract error body (a proxy HTML page) to UNEXPECTED_RESPONSE, keeping the request ID header', async () => {
      const { client } = clientReturning(
        new Response('<html>Bad Gateway</html>', { status: 502, headers: { 'x-request-id': 'request-0002' } }),
      );

      const error = await rejectionOf(client.get('/artworks'));

      expect(error).toMatchObject({ status: 502, code: 'UNEXPECTED_RESPONSE', details: {}, correlationId: 'request-0002' });
    });

    it('maps a network failure to NETWORK_ERROR', async () => {
      const { client } = clientReturning(new TypeError('fetch failed'));

      const error = await rejectionOf(client.get('/artworks'));

      expect(error).toMatchObject({ status: 0, code: 'NETWORK_ERROR', correlationId: null });
    });

    it('lets a cancelled request reject with the AbortError, not an ApiError', async () => {
      const { client } = clientReturning(new DOMException('aborted', 'AbortError'));

      await expect(client.get('/artworks')).rejects.toMatchObject({ name: 'AbortError' });
    });
  });
});

describe('toQueryString', () => {
  it('is empty when there is nothing to send', () => {
    expect(toQueryString(undefined)).toBe('');
    expect(toQueryString({ query: '', medium: null })).toBe('');
  });

  it('encodes values', () => {
    expect(toQueryString({ query: 'blue & gold' })).toBe('?query=blue+%26+gold');
  });
});
