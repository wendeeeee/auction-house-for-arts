/** SQLSTATE codes this project reacts to. https://www.postgresql.org/docs/16/errcodes-appendix.html */
export const POSTGRES_UNIQUE_VIOLATION = '23505';

/**
 * True when `error` is a unique violation of the named constraint or index. Matching the name,
 * not only the code, keeps an unrelated duplicate (a slug collision, say) from being reported
 * as the business rule the caller expected.
 */
export function isUniqueViolation(error: unknown, constraintName: string): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === POSTGRES_UNIQUE_VIOLATION &&
    'constraint' in error &&
    error.constraint === constraintName
  );
}
