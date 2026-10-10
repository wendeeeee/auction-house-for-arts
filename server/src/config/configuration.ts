import { z } from 'zod';

export type NodeEnvironment = 'development' | 'test' | 'production';

export interface DatabaseConfig {
  readonly url: string;
  readonly poolMax: number;
}

export interface TracingConfig {
  /** Undefined means "use the process's own default" (art-auction-api or art-auction-worker). */
  readonly serviceName: string | undefined;
  readonly exporterEndpoint: string;
  readonly isDisabled: boolean;
}

export interface AppConfig {
  readonly nodeEnvironment: NodeEnvironment;
  readonly api: { readonly port: number };
  readonly database: DatabaseConfig;
  readonly tracing: TracingConfig;
}

/** Thrown at boot. Not a DomainError: there is no request to answer, only a process to stop. */
export class InvalidConfigurationError extends Error {
  constructor(readonly problems: readonly string[]) {
    super(`Invalid configuration:\n${problems.map((problem) => `  - ${problem}`).join('\n')}`);
    this.name = 'InvalidConfigurationError';
  }
}

const POSTGRES_URL_PATTERN = /^postgres(ql)?:\/\/.+/;

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  API_PORT: z.coerce.number().int().min(1).max(65_535).default(4101),
  DATABASE_URL: z
    .string({ error: 'is required' })
    .regex(POSTGRES_URL_PATTERN, { error: 'must be a postgres:// connection URL' }),
  DATABASE_POOL_MAX: z.coerce.number().int().min(1).max(100).default(10),
  OTEL_SERVICE_NAME: z.string().min(1).optional(),
  OTEL_EXPORTER_OTLP_ENDPOINT: z.url({ error: 'must be an http(s) URL' }).default('http://localhost:4328'),
  OTEL_SDK_DISABLED: z
    .enum(['true', 'false'], { error: 'must be "true" or "false"' })
    .optional()
    .transform((value) => value === 'true'),
});

/**
 * Builds the typed configuration from an environment map. Pure, so it is unit-tested with
 * plain objects. Every problem is reported at once, so a misconfigured deploy fails with one
 * message that lists everything to fix, instead of one variable per restart.
 */
export function loadConfiguration(environment: NodeJS.ProcessEnv): AppConfig {
  const result = environmentSchema.safeParse(withoutEmptyValues(environment));
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
  };
}

/** `FOO=` in a .env file means "not set", so it gets the default rather than failing as "". */
function withoutEmptyValues(environment: NodeJS.ProcessEnv): Record<string, string> {
  const entries = Object.entries(environment).filter(
    (entry): entry is [string, string] => entry[1] !== undefined && entry[1] !== '',
  );
  return Object.fromEntries(entries);
}
