import { z } from 'zod';

export type NodeEnvironment = 'development' | 'test' | 'production';

export interface DatabaseConfig {
  readonly url: string;
  readonly poolMax: number;
}

export interface TracingConfig {
  readonly serviceName: string | undefined;
  readonly exporterEndpoint: string;
  readonly isDisabled: boolean;
}

export interface RedisConfig {
  /** Backs the Socket.IO adapter, so several API instances share rooms. */
  readonly url: string;
}

export interface MessagingConfig {
  /** Only the worker connects. */
  readonly rabbitMqUrl: string;
}

export interface AuctionsConfig {
  /** A price or leader change this close to `ends_at` pushes the end out to `acceptedAt + window`. */
  readonly softCloseWindowSeconds: number;
}

export interface LedgerConfig {
  /** The platform's commission on every sale, in basis points (1,000 = 10%). */
  readonly platformFeeBps: number;
}

export interface StripeConfig {
  /** A test-mode key (`sk_test_…`); live keys are refused at boot. */
  readonly secretKey: string;
  /** The signing secret of the webhook endpoint (`whsec_…`), from `stripe listen` locally. */
  readonly webhookSecret: string;
}

export interface PaymentsConfig {
  /** Null when no Stripe keys are set: checkout answers 503 and the rest of the app works. */
  readonly stripe: StripeConfig | null;
}

export interface WebConfig {
  /** Where the web app is served; checkout returns the buyer here. */
  readonly baseUrl: string;
}

export interface StorageConfig {
  /** Must be reachable from the browser too: presigned upload URLs point here. */
  readonly endpoint: string;
  readonly region: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;
  readonly bucket: string;
}

export interface OpenAiConfig {
  readonly apiKey: string;
  readonly model: string;
  /** Any OpenAI-compatible endpoint; undefined for OpenAI itself. */
  readonly baseUrl: string | undefined;
}

export interface LanguageModelConfig {
  /** Null without OPENAI_API_KEY: the Concierge is offline and search uses keywords only. */
  readonly openAi: OpenAiConfig | null;
}

export interface AssistantConfig {
  readonly turnsPerHour: number;
}

export interface AppConfig {
  readonly nodeEnvironment: NodeEnvironment;
  readonly api: { readonly port: number };
  readonly database: DatabaseConfig;
  readonly tracing: TracingConfig;
  readonly redis: RedisConfig;
  readonly messaging: MessagingConfig;
  readonly auctions: AuctionsConfig;
  readonly ledger: LedgerConfig;
  readonly payments: PaymentsConfig;
  readonly web: WebConfig;
  readonly storage: StorageConfig;
  readonly languageModel: LanguageModelConfig;
  readonly assistant: AssistantConfig;
}

/** Thrown at boot. Not a DomainError: there is no request to answer, only a process to stop. */
export class InvalidConfigurationError extends Error {
  constructor(readonly problems: readonly string[]) {
    super(`Invalid configuration:\n${problems.map((problem) => `  - ${problem}`).join('\n')}`);
    this.name = 'InvalidConfigurationError';
  }
}

const POSTGRES_URL_PATTERN = /^postgres(ql)?:\/\/.+/;
const REDIS_URL_PATTERN = /^rediss?:\/\/.+/;
const AMQP_URL_PATTERN = /^amqps?:\/\/.+/;

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().min(1).max(65_535).default(4101),
  DATABASE_URL: z
    .string({ error: 'is required' })
    .regex(POSTGRES_URL_PATTERN, { error: 'must be a postgres:// connection URL' }),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  REDIS_URL: z
    .string()
    .regex(REDIS_URL_PATTERN, { error: 'must be a redis:// or rediss:// connection URL' })
    .default('redis://localhost:56380'),
  RABBITMQ_URL: z
    .string()
    .regex(AMQP_URL_PATTERN, { error: 'must be an amqp:// or amqps:// connection URL' })
    .default('amqp://art_auction:art_auction@localhost:56727'),
  OTEL_SERVICE_NAME: z.string().min(1).optional(),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.url({ error: 'must be an http(s) URL' }).default('http://localhost:4328'),
  OTEL_SDK_DISABLED: z
    .enum(['true', 'false'], { error: 'must be "true" or "false"' })
    .optional()
    .transform((value) => value === 'true'),
  // Capped at an hour: a longer window would keep every busy auction open far past its stated end.
  SOFT_CLOSE_WINDOW_SECONDS: z.coerce.number().int().min(1).max(3_600).default(120),
  // Capped at 50%: with the 20% royalty cap, a seller's proceeds can never go negative.
  PLATFORM_FEE_BPS: z.coerce.number().int().min(0).max(5_000).default(1_000),
  // Test mode only: this project never moves real money.
  STRIPE_SECRET_KEY: z.string().startsWith('sk_test_', { error: 'must be a Stripe test-mode key (sk_test_…)' }).optional(),
  STRIPE_WEBHOOK_SECRET: z.string().startsWith('whsec_', { error: 'must be a Stripe webhook signing secret (whsec_…)' }).optional(),
  WEB_BASE_URL: z.url({ error: 'must be an http(s) URL' }).default('http://localhost:5201'),
  S3_ENDPOINT: z.url({ error: 'must be an http(s) URL' }).default('http://localhost:59000'),
  S3_REGION: z.string().min(1).default('us-east-1'),
  S3_ACCESS_KEY_ID: z.string().min(1).default('art_auction'),
  S3_SECRET_ACCESS_KEY: z.string().min(1).default('art_auction_secret'),
  S3_BUCKET: z
    .string()
    .regex(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/, { error: 'must be a valid S3 bucket name' })
    .default('artwork-images'),
  OPENAI_API_KEY: z.string().min(1).optional(),
  OPENAI_MODEL: z.string().min(1).default('gpt-5.2'),
  OPENAI_BASE_URL: z.url({ protocol: /^https?$/, error: 'must be an http(s) URL' }).optional(),
  ASSISTANT_TURNS_PER_HOUR: z.coerce.number().int().min(1).max(10_000).default(50),
});

/** Half a Stripe configuration would accept checkouts whose payments could never be confirmed. */
const environmentSchemaWithRules = environmentSchema.superRefine((values, context) => {
  if ((values.STRIPE_SECRET_KEY === undefined) !== (values.STRIPE_WEBHOOK_SECRET === undefined)) {
    context.addIssue({
      code: 'custom',
      path: [values.STRIPE_SECRET_KEY === undefined ? 'STRIPE_SECRET_KEY' : 'STRIPE_WEBHOOK_SECRET'],
      message: 'must be set together with the other Stripe variable (or neither, to run without payments)',
    });
  }
});

/**
 * Builds the typed configuration from an environment map. Pure, so it is unit-tested with
 * plain objects. Every problem is reported at once, so a misconfigured deploy fails with one
 * message that lists everything to fix, instead of one variable per restart.
 */
export function loadConfiguration(environment: NodeJS.ProcessEnv): AppConfig {
  const result = environmentSchemaWithRules.safeParse(withoutEmptyValues(environment));
  if (!result.success) {
    throw new InvalidConfigurationError(
      result.error.issues.map((issue) => `${issue.path.join('.')} ${issue.message}`),
    );
  }
  const values = result.data;
  return {
    nodeEnvironment: values.NODE_ENV,
    api: { port: values.API_PORT },
    database: { url: values.DATABASE_URL, poolMax: values.DATABASE_POOL_MAX },
    tracing: {
      serviceName: values.OTEL_SERVICE_NAME,
      exporterEndpoint: values.OTEL_EXPORTER_OTLP_ENDPOINT,
      isDisabled: values.OTEL_SDK_DISABLED,
    },
    redis: { url: values.REDIS_URL },
    messaging: { rabbitMqUrl: values.RABBITMQ_URL },
    auctions: { softCloseWindowSeconds: values.SOFT_CLOSE_WINDOW_SECONDS },
    ledger: { platformFeeBps: values.PLATFORM_FEE_BPS },
    payments: {
      stripe:
        values.STRIPE_SECRET_KEY !== undefined && values.STRIPE_WEBHOOK_SECRET !== undefined
          ? { secretKey: values.STRIPE_SECRET_KEY, webhookSecret: values.STRIPE_WEBHOOK_SECRET }
          : null,
    },
    web: { baseUrl: values.WEB_BASE_URL.replace(/\/+$/, '') },
    storage: {
      endpoint: values.S3_ENDPOINT.replace(/\/+$/, ''),
      region: values.S3_REGION,
      accessKeyId: values.S3_ACCESS_KEY_ID,
      secretAccessKey: values.S3_SECRET_ACCESS_KEY,
      bucket: values.S3_BUCKET,
    },
    languageModel: {
      openAi:
        values.OPENAI_API_KEY === undefined
          ? null
          : { apiKey: values.OPENAI_API_KEY, model: values.OPENAI_MODEL, baseUrl: values.OPENAI_BASE_URL },
    },
    assistant: { turnsPerHour: values.ASSISTANT_TURNS_PER_HOUR },
  };
}

/** `FOO=` in a .env file means "not set", so it gets the default rather than failing as "". */
function withoutEmptyValues(environment: NodeJS.ProcessEnv): Record<string, string> {
  const entries = Object.entries(environment).filter(
    (entry): entry is [string, string] => entry[1] !== undefined && entry[1] !== '',
  );
  return Object.fromEntries(entries);
}
