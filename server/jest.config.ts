import type { Config } from 'jest';

const transform: Config['transform'] = {
  '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.json' }],
};

const base: Config = {
  moduleFileExtensions: ['ts', 'js', 'json'],
  testEnvironment: 'node',
  transform,
};

/**
 * Three projects with different costs:
 * - unit: pure code beside the source, no I/O, safe to run in parallel.
 * - integration and e2e: a real PostgreSQL (`art_auction_test`). Their npm scripts pass
 *   `--runInBand` because every file shares that one database.
 */
const config: Config = {
  testTimeout: 30_000,
  projects: [
    { ...base, displayName: 'unit', testMatch: ['<rootDir>/src/**/*.spec.ts'] },
    {
      ...base,
      displayName: 'integration',
      testMatch: ['<rootDir>/test/integration/**/*.int-spec.ts'],
      setupFiles: ['<rootDir>/test/support/test-environment.ts'],
    },
    {
      ...base,
      displayName: 'e2e',
      testMatch: ['<rootDir>/test/e2e/**/*.e2e-spec.ts'],
      setupFiles: ['<rootDir>/test/support/test-environment.ts'],
    },
  ],
};

export default config;
