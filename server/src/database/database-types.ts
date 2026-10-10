import { CustomTypesConfig, types } from 'pg';
import { InvariantViolationError } from '../common/errors';

const INT8_OID = 20;

/**
 * BIGINT (`*_cents`, `count(*)`) arrives from `pg` as a string, because it can exceed 2^53.
 * Money in this project is a safe-integer `number`, so it is parsed to `number` here, once,
 * and a value outside the safe range fails loudly instead of silently losing cents.
 */
export function parseSafeBigint(text: string): number {
  const value = Number(text);
  if (!Number.isSafeInteger(value)) {
    throw new InvariantViolationError('A BIGINT column held a value outside the safe-integer range.', {
      value: text,
    });
  }
  return value;
}

/** Passed to each Pool, rather than set globally with `types.setTypeParser`, so nothing leaks between pools. */
export const databaseTypes: CustomTypesConfig = {
  getTypeParser: ((oid: number, format?: 'text' | 'binary') =>
    oid === INT8_OID && format !== 'binary'
      ? parseSafeBigint
      : types.getTypeParser(oid, format ?? 'text')) as CustomTypesConfig['getTypeParser'],
};
