/**
 * Runs before every integration and e2e test file. Points the app at the test database and
 * keeps tests off the network: tracing is disabled, so Jaeger never needs to be running.
 * CI overrides TEST_DATABASE_URL; locally the default matches docker-compose.yml.
 */
const testDatabaseUrl =
  process.env.TEST_DATABASE_URL ?? 'postgres://art_auction:art_auction@localhost:55442/art_auction_test';

process.env.NODE_ENV = 'test';
process.env.TEST_DATABASE_URL = testDatabaseUrl;
process.env.DATABASE_URL = testDatabaseUrl;
process.env.OTEL_SDK_DISABLED = 'true';
