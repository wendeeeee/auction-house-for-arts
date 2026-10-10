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
      storage: {
        endpoint: 'http://localhost:59000',
        region: 'us-east-1',
        accessKeyId: 'art_auction',
        secretAccessKey: 'art_auction_secret',
        bucket: 'artwork-images',
      },
      languageModel: { openAi: null },
      assistant: { turnsPerHour: 50 },
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
      S3_ENDPOINT: 'https://storage.example.com/',
      S3_REGION: 'eu-west-1',
      S3_ACCESS_KEY_ID: 'access',
      S3_SECRET_ACCESS_KEY: 'secret',
      S3_BUCKET: 'art-images',
      OPENAI_API_KEY: 'sk-example',
      OPENAI_MODEL: 'local-model',
      OPENAI_BASE_URL: 'http://localhost:11434/v1',
      ASSISTANT_TURNS_PER_HOUR: '20',
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
      storage: {
        endpoint: 'https://storage.example.com',
        region: 'eu-west-1',
        accessKeyId: 'access',
        secretAccessKey: 'secret',
        bucket: 'art-images',
      },
      languageModel: {
        openAi: { apiKey: 'sk-example', model: 'local-model', baseUrl: 'http://localhost:11434/v1' },
      },
      assistant: { turnsPerHour: 20 },
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

  it('rejects a bucket name S3 would refuse', () => {
    expect(problemsFor({ DATABASE_URL, S3_BUCKET: 'Artwork_Images' })).toEqual(['S3_BUCKET must be a valid S3 bucket name']);
  });

  it('validates the language model settings', () => {
    const problems = problemsFor({ DATABASE_URL, OPENAI_BASE_URL: 'localhost:11434', ASSISTANT_TURNS_PER_HOUR: '0' });
    expect(problems.map((problem) => problem.split(' ')[0])).toEqual(['OPENAI_BASE_URL', 'ASSISTANT_TURNS_PER_HOUR']);
    expect(problems).toContain('OPENAI_BASE_URL must be an http(s) URL');
  });

  it('ignores unrelated environment variables', () => {
    expect(() => loadConfiguration({ DATABASE_URL, PATH: '/usr/bin', HOME: '/home/someone' })).not.toThrow();
  });
});
