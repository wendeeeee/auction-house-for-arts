import { Attributes, Span, SpanStatusCode, trace } from '@opentelemetry/api';

const TRACER_NAME = 'art-auction';

/**
 * Runs `work` inside a new active span (child of the current one), so database calls made
 * inside appear nested under it. A thrown error is recorded on the span, marks it as failed,
 * and is rethrown unchanged. With tracing off, the API's no-op tracer makes this nearly free.
 */
export async function withSpan<T>(name: string, attributes: Attributes, work: (span: Span) => Promise<T>): Promise<T> {
  // Looked up per call so a tracer provider registered after import (in tests) is used.
  const tracer = trace.getTracer(TRACER_NAME);
  return tracer.startActiveSpan(name, { attributes }, async (span) => {
    try {
      return await work(span);
    } catch (error) {
      const exception = error instanceof Error ? error : new Error(String(error));
      span.recordException(exception);
      span.setStatus({ code: SpanStatusCode.ERROR, message: exception.message });
      throw error;
    } finally {
      span.end();
    }
  });
}
