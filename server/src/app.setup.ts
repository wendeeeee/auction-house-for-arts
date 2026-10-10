import type { NestFastifyApplication } from '@nestjs/platform-fastify';
import { DocumentBuilder, OpenAPIObject, SwaggerModule } from '@nestjs/swagger';
import type { FastifyInstance } from 'fastify';
import { registerCorrelationIdHooks } from './common/context';
import { AllExceptionsFilter } from './common/filters';
import { registerRequestLoggingHook } from './common/logging';

export const API_PREFIX = 'api';
export const OPENAPI_PATH = 'api/docs';

export interface ConfigureAppOptions {
  /** Skip serving the Swagger UI HTML (the JSON document is still available). Useful in tests that don't need @fastify/static. */
  readonly swaggerUiEnabled?: boolean;
}

/**
 * Everything that makes the HTTP surface behave as specified: the route prefix, correlation IDs,
 * the error contract, and OpenAPI. Shared by `main.ts`, the e2e tests, and `docs:openapi`, so
 * tests exercise exactly what production serves. Call before `app.init()` / `app.listen()`.
 */
export function configureApp(app: NestFastifyApplication, options: ConfigureAppOptions = {}): void {
  const { swaggerUiEnabled = true } = options;

  // Cast needed: @nestjs/platform-fastify bundles its own fastify copy whose types are
  // structurally identical but come from a different node_modules path.
  const fastify = app.getHttpAdapter().getInstance() as unknown as FastifyInstance;
  registerCorrelationIdHooks(fastify);
  registerRequestLoggingHook(fastify);

  app.setGlobalPrefix(API_PREFIX);
  app.useGlobalFilters(new AllExceptionsFilter());

  SwaggerModule.setup(OPENAPI_PATH, app, createOpenApiDocument(app), { swaggerUiEnabled });
}

export function createOpenApiDocument(app: NestFastifyApplication): OpenAPIObject {
  const config = new DocumentBuilder()
    .setTitle('Art Auction House API')
    .setDescription(
      'Real-time auctions for original art. Errors use `{ error: { code, message, details, correlationId } }`. ' +
        'Identity is a demo switcher: send `X-Demo-User-Id` with a user ID from `GET /api/users`.',
    )
    .setVersion('0.1.0')
    .addGlobalParameters({
      name: 'X-Request-Id',
      in: 'header',
      required: false,
      description: 'Correlation ID echoed in the response; generated when absent or malformed.',
      schema: { type: 'string' },
    })
    .build();
  return SwaggerModule.createDocument(app, config);
}
