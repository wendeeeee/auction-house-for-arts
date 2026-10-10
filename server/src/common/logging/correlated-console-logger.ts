import { ConsoleLogger, LogLevel } from '@nestjs/common';
import { RequestContext } from '../context';

/**
 * Nest's logger in JSON mode, one object per line, with the request's correlation ID added
 * whenever the log line is written while handling a request. A log search for the ID in an
 * error response then finds every line that request produced.
 */
export class CorrelatedConsoleLogger extends ConsoleLogger {
  constructor() {
    super({ json: true });
  }

  protected override getJsonLogObject(
    message: unknown,
    options: { context: string; logLevel: LogLevel; writeStreamType?: 'stdout' | 'stderr'; errorStack?: unknown },
  ) {
    const logObject = super.getJsonLogObject(message, options);
    const correlationId = RequestContext.correlationId();
    return correlationId ? { ...logObject, correlationId } : logObject;
  }
}
