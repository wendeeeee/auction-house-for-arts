import { InvalidConfigurationError, loadConfiguration } from './configuration';

const DATABASE_URL = 'postgres://art_auction:art_auction@localhost:55442/art_auction';

function problemsFor(environment: NodeJS.ProcessEnv): readonly string[] {
  try {
    loadConfiguration(environment);
  } catch (error) {
    if (error instanceof InvalidConfigurationError) return error.problems;
    throw error;
  }
  throw new Error('expected loadConfiguration to fail');
}

describe('loadConfiguration', () => {
  it('applies defaults when only the required values are set', () => {
    expect(loadConfiguration({ DATABASE_URL })).toEqual({
      nodeEnvironment: 'development',
      api: { port: 4101 },
      database: { url: DATABASE_URL, poolMax: 10 },
      tracing: { serviceName: undefined, exporterEndpoint: 'http://localhost:4328', isDisabled: false },
      redis: { url: 'redis://localhost:56380' },
      messaging: { rabbitMqUrl: 'amqp://art_auction:art_auction@localhost:56727' },
      auctions: { softCloseWindowSeconds: 120 },
      ledger: { platformFeeBps: 1_000 },
      payments: { stripe: null },
      web: { baseUrl: 'http://localhost:5201' },
    });
  });

  it('parses and coerces every value it is given', () => {
    const config = loadConfiguration({
      NODE_ENV: 'production',
      API_PORT: '8080',
      DATABASE_URL: 'postgresql://user:secret@db:5432/art',
      DATABASE_POOL_MAX: '25',
      REDIS_URL: 'rediss://cache:6380',
      RABBITMQ_URL: 'amqps://user:secret@broker:5671',
      OTEL_SERVICE_NAME: 'custom-name',
      OTEL_EXPORTER_OTLP_ENDPOINT: 'http://collector:4318',
      OTEL_SDK_DISABLED: 'true',
      SOFT_CLOSE_WINDOW_SECONDS: '30',
      PLATFORM_FEE_BPS: '1250',
      STRIPE_SECRET_KEY: 'sk_test_example',
      STRIPE_WEBHOOK_SECRET: 'whsec_example',
      WEB_BASE_URL: 'https://art.example.com/',
    });
    expect(config).toEqual({
      nodeEnvironment: 'production',
      api: { port: 8080 },
      database: { url: 'postgresql://user:secret@db:5432/art', poolMax: 25 },
      tracing: { serviceName: 'custom-name', exporterEndpoint: 'http://collector:4318', isDisabled: true },
      redis: { url: 'rediss://cache:6380' },
      messaging: { rabbitMqUrl: 'amqps://user:secret@broker:5671' },
      auctions: { softCloseWindowSeconds: 30 },
      ledger: { platformFeeBps: 1_250 },
      payments: { stripe: { secretKey: 'sk_test_example', webhookSecret: 'whsec_example' } },
      web: { baseUrl: 'https://art.example.com' },
    });
  });

  it('fails fast with a clear message when a required value is missing', () => {
    expect(() => loadConfiguration({})).toThrow(/Invalid configuration:\n {2}- DATABASE_URL is required/);
  });

  it('treats an empty value as unset', () => {
    expect(problemsFor({ DATABASE_URL: '' })).toEqual(['DATABASE_URL is required']);
    expect(loadConfiguration({ DATABASE_URL, API_PORT: '' }).api.port).toBe(4101);
  });

  it('reports every invalid value at once', () => {
    const problems = problemsFor({
      NODE_ENV: 'staging',
      API_PORT: 'eighty',
      DATABASE_URL: 'mysql://localhost/art',
      DATABASE_POOL_MAX: '0',
      REDIS_URL: 'http://localhost:6379',
      RABBITMQ_URL: 'http://localhost:5672',
      OTEL_SDK_DISABLED: 'yes',
      SOFT_CLOSE_WINDOW_SECONDS: '0',
      PLATFORM_FEE_BPS: '5001',
    });
    expect(problems.map((problem) => problem.split(' ')[0])).toEqual([
      'NODE_ENV',
      'API_PORT',
      'DATABASE_URL',
      'DATABASE_POOL_MAX',
      'REDIS_URL',
      'RABBITMQ_URL',
      'OTEL_SDK_DISABLED',
      'SOFT_CLOSE_WINDOW_SECONDS',
      'PLATFORM_FEE_BPS',
    ]);
    expect(problems).toContain('DATABASE_URL must be a postgres:// connection URL');
  });

  it('refuses a live Stripe key, so this project can never move real money', () => {
    expect(problemsFor({ DATABASE_URL, STRIPE_SECRET_KEY: 'sk_live_example', STRIPE_WEBHOOK_SECRET: 'whsec_example' })).toEqual([
      'STRIPE_SECRET_KEY must be a Stripe test-mode key (sk_test_…)',
    ]);
  });

  it('requires both Stripe variables or neither, without echoing the secret', () => {
    const problems = problemsFor({ DATABASE_URL, STRIPE_SECRET_KEY: 'sk_test_example' });
    expect(problems).toEqual([
      'STRIPE_WEBHOOK_SECRET must be set together with the other Stripe variable (or neither, to run without payments)',
    ]);
    expect(problems.join(' ')).not.toContain('sk_test_example');
  });

  it('ignores unrelated environment variables', () => {
    expect(() => loadConfiguration({ DATABASE_URL, PATH: '/usr/bin', HOME: '/home/someone' })).not.toThrow();
  });
});
