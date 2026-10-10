import type { SchemaObject } from '@nestjs/swagger/dist/interfaces/open-api-spec.interface';
import { z } from 'zod';

/**
 * Converts a zod schema to an OpenAPI 3.0 schema for `@ApiOkResponse({ schema })`. Request and
 * response shapes are defined once, in zod, and both the runtime types and the docs come from it.
 */
export function toOpenApiSchema(schema: z.ZodType): SchemaObject {
  const { $schema: _ignored, ...openApiSchema } = z.toJSONSchema(schema, { target: 'openapi-3.0', io: 'output' });
  return openApiSchema as SchemaObject;
}
