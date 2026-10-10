/**
 * The source of "now" for every time-based rule (auction end, soft close, expiry).
 * Injected so tests can move time deterministically instead of sleeping.
 * The abstract class doubles as the Nest injection token.
 */
export abstract class Clock {
  abstract now(): Date;
}

export class SystemClock extends Clock {
  now(): Date {
    return new Date();
  }
}
