/**
 * Query strings send `?medium=` for "no filter": trim, and treat blank as absent. Use with
 * `z.preprocess(blankAsAbsent, …optional())` so a blank value gets the default, not an error.
 */
export function blankAsAbsent(value: unknown): unknown {
  if (typeof value !== 'string') return value;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}
