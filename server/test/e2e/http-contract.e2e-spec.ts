import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { createTestApp } from '../support/create-test-app';
import { prepareTestDatabase } from '../support/test-database';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe('HTTP contract', () => {
  let app: NestFastifyApplication;

  beforeAll(async () => {
    await prepareTestDatabase();
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('correlation ID', () => {
    it('echoes a well-formed X-Request-Id', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/health', headers: { 'x-request-id': 'client-trace-1234' } });

      expect(response.headers['x-request-id']).toBe('client-trace-1234');
    });

    it('generates one when the header is missing', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/health' });

      expect(response.headers['x-request-id']).toMatch(UUID_PATTERN);
    });

    it('replaces a malformed one instead of echoing it into logs', async () => {
      const response = await app.inject({
        method: 'GET',
        url: '/api/health',
        headers: { 'x-request-id': 'bad id\twith "injection"' },
      });

      expect(response.headers['x-request-id']).toMatch(UUID_PATTERN);
    });
  });

  it('answers an unknown route with the error contract, carrying the same correlation ID', async () => {
    const response = await app.inject({
      method: 'GET',
      url: '/api/no-such-route',
      headers: { 'x-request-id': 'unknown-route-0001' },
    });

    expect(response.statusCode).toBe(404);
    expect(response.headers['content-type']).toMatch(/^application\/json/);
    expect(response.json()).toEqual({
      error: {
        code: 'ROUTE_NOT_FOUND',
        message: expect.any(String),
        details: {},
        correlationId: 'unknown-route-0001',
      },
    });
  });

  it('serves the OpenAPI document', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/docs-json' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ openapi: expect.any(String), paths: { '/api/health': expect.any(Object) } });
  });
});
