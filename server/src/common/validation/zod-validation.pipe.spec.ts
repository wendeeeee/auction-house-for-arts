import { z } from 'zod';
import { ErrorCode, ValidationFailedError } from '../errors';
import { ZodValidationPipe } from './zod-validation.pipe';

const schema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  medium: z.enum(['Painting', 'Print']).optional(),
});

describe('ZodValidationPipe', () => {
  const pipe = new ZodValidationPipe(schema);

  it('returns the parsed output, with coercion and defaults applied', () => {
    expect(pipe.transform({ page: '3', medium: 'Print' })).toEqual({ page: 3, medium: 'Print' });
    expect(pipe.transform({})).toEqual({ page: 1 });
  });

  it('throws VALIDATION_FAILED with one entry per bad field', () => {
    let thrown: unknown;
    try {
      pipe.transform({ page: '0', medium: 'Fresco' });
    } catch (error) {
      thrown = error;
    }
    expect(thrown).toBeInstanceOf(ValidationFailedError);
    const error = thrown as ValidationFailedError;
    expect(error.code).toBe(ErrorCode.VALIDATION_FAILED);
    expect(error.httpStatus).toBe(400);
    expect(error.details.fieldErrors).toEqual([
      { path: 'page', message: expect.any(String) },
      { path: 'medium', message: expect.any(String) },
    ]);
  });
});
