import { Clock } from '../../src/common/clock';

/** A clock that only moves when a test moves it. Override `Clock` with this in a testing module. */
export class FakeClock extends Clock {
  private currentMilliseconds: number;

  constructor(start: Date = new Date('2026-01-15T12:00:00.000Z')) {
    super();
    this.currentMilliseconds = start.getTime();
  }

  now(): Date {
    return new Date(this.currentMilliseconds);
  }

  setTo(instant: Date): void {
    this.currentMilliseconds = instant.getTime();
  }

  advanceBySeconds(seconds: number): void {
    this.currentMilliseconds += seconds * 1_000;
  }
}
