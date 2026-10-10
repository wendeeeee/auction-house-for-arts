/**
 * The source of "now" for every time-based rule (auction end, soft close, expiry).
 
 */
export abstract class Clock {
  abstract now(): Date;
}

export class SystemClock extends Clock {
  now(): Date {
    return new Date();
  }
}
