import { PipeTransform } from '@nestjs/common';
import type { ZodType, core } from 'zod';
import { FieldError, ValidationFailedError } from '../errors';

/**
 * Validates and parses one handler argument with a zod schema:
 * `@Query(new ZodValidationPipe(listArtworksQuerySchema)) query: ListArtworksQuery`.
 * The handler receives the parsed output (defaults applied, strings coerced), never raw input.
 */
export class ZodValidationPipe<Output> implements PipeTransform<unknown, Output> {
  constructor(private readonly schema: ZodType<Output>) {}

  transform(value: unknown): Output {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw new ValidationFailedError(toFieldErrors(result.error.issues));
    }
    return result.data;
  }
}

export function toFieldErrors(issues: readonly core.$ZodIssue[]): FieldError[] {
  return issues.map((issue) => ({
    path: issue.path.map(String).join('.'),
    message: issue.message,
  }));
}
