import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import type { Pool } from 'pg';
import { SEED_USERS } from '../../src/database/seed/seed-data';
import { seedCatalog } from '../../src/database/seed/seed-catalog';
import { createTestApp } from '../support/create-test-app';
import { createTestPool, prepareTestDatabase, truncateAllTables } from '../support/test-database';

const ADA = SEED_USERS.find((user) => user.handle === 'ada_mensah')!;
const UNKNOWN_BUT_WELL_FORMED_ID = '5eed0000-0000-4000-8000-0000000000ff';

describe('demo identity (X-Demo-User-Id)', () => {
  let app: NestFastifyApplication;
  let pool: Pool;

  beforeAll(async () => {
    await prepareTestDatabase();
    pool = createTestPool();
    await truncateAllTables(pool);
    await seedCatalog(pool);
    app = await createTestApp();
  });

  afterAll(async () => {
    await app.close();
    await pool.end();
  });

  const getMe = (headers: Record<string, string> = {}) => app.inject({ method: 'GET', url: '/api/users/me', headers });

  it('treats a request without the header as anonymous: public routes work', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/artworks' });
    expect(response.statusCode).toBe(200);
  });

  it('rejects an anonymous request to a route that requires a user', async () => {
    const response = await getMe();

    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe('UNAUTHENTICATED');
  });

  it('resolves a valid ID to that user', async () => {
    const response = await getMe({ 'x-demo-user-id': ADA.id });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ id: ADA.id, displayName: 'Ada Mensah', handle: 'ada_mensah' });
  });

  it.each([
    ['an unknown ID', UNKNOWN_BUT_WELL_FORMED_ID],
    ['a malformed ID', 'not-a-uuid'],
    ['an SQL-looking ID', "' OR 1=1 --"],
  ])('returns 401 for %s, even on a public route', async (_description, header) => {
    for (const url of ['/api/users/me', '/api/artworks']) {
      const response = await app.inject({ method: 'GET', url, headers: { 'x-demo-user-id': header } });

      expect(response.statusCode).toBe(401);
      expect(response.json()).toEqual({
        error: { code: 'UNAUTHENTICATED', message: expect.any(String), details: {}, correlationId: expect.any(String) },
      });
    }
  });

  it('lists the demo users for the switcher', async () => {
    const response = await app.inject({ method: 'GET', url: '/api/users' });

    expect(response.statusCode).toBe(200);
    const { items } = response.json();
    expect(items).toHaveLength(10);
    expect(items).toContainEqual({ id: ADA.id, displayName: 'Ada Mensah', handle: 'ada_mensah' });
  });
});
