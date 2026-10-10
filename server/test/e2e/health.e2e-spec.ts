import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { DATABASE_POOL, createDatabasePool } from '../../src/database';
import { createTestApp } from '../support/create-test-app';
import { prepareTestDatabase } from '../support/test-database';

describe('GET /api/health', () => {
  beforeAll(async () => {
    await prepareTestDatabase();
  });

  describe('with the database up', () => {
    let app: NestFastifyApplication;

    beforeAll(async () => {
      app = await createTestApp();
    });

    afterAll(async () => {
      await app.close();
    });

    it('returns 200 with every check up', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/health' });

      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ status: 'ok', checks: { database: 'up' } });
    });
  });

  describe('with the database unreachable', () => {
    let app: NestFastifyApplication;

    beforeAll(async () => {
      // Port 1 on loopback refuses connections immediately, so this is fast and deterministic.
      app = await createTestApp({
        configure: (builder) =>
          builder
            .overrideProvider(DATABASE_POOL)
            .useValue(createDatabasePool({ connectionString: 'postgres://nobody:nothing@127.0.0.1:1/none', max: 1 })),
      });
    });

    afterAll(async () => {
      await app.close();
    });

    it('returns 503 and reports the database as down', async () => {
      const response = await app.inject({ method: 'GET', url: '/api/health' });

      expect(response.statusCode).toBe(503);
      expect(response.json()).toEqual({ status: 'unavailable', checks: { database: 'down' } });
    });
  });
});
