/**
 * Escapes `%`, `_`, and the escape character itself, so user text is matched literally inside
 * a LIKE / ILIKE pattern. Postgres's default escape character is the backslash, and with
 * `standard_conforming_strings` on (the default) a bound parameter needs no further quoting.
 * Without this, a search for "100%" would match every row containing "100".
 */
export function escapeLikePattern(text: string): string {
  return text.replace(/[\\%_]/g, (character) => `\\${character}`);
}
