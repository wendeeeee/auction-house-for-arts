import { SpanStatusCode, trace } from '@opentelemetry/api';
import { BasicTracerProvider, InMemorySpanExporter, SimpleSpanProcessor } from '@opentelemetry/sdk-trace-base';
import { withSpan } from './with-span';

describe('withSpan', () => {
  const exporter = new InMemorySpanExporter();

  beforeAll(() => {
    trace.setGlobalTracerProvider(new BasicTracerProvider({ spanProcessors: [new SimpleSpanProcessor(exporter)] }));
  });

  afterEach(() => exporter.reset());

  afterAll(() => trace.disable());

  it('returns the result and ends a span with the given name and attributes', async () => {
    const result = await withSpan('catalog.list', { 'catalog.medium': 'Print' }, async () => 42);

    expect(result).toBe(42);
    const [span] = exporter.getFinishedSpans();
    expect(span?.name).toBe('catalog.list');
    expect(span?.attributes).toEqual({ 'catalog.medium': 'Print' });
    expect(span?.status.code).toBe(SpanStatusCode.UNSET);
  });

  it('records the exception, sets error status, ends the span, and rethrows the same error', async () => {
    const failure = new Error('database unavailable');

    await expect(withSpan('catalog.list', {}, async () => Promise.reject(failure))).rejects.toBe(failure);

    const [span] = exporter.getFinishedSpans();
    expect(span?.status).toEqual({ code: SpanStatusCode.ERROR, message: 'database unavailable' });
    expect(span?.events.map((event) => event.name)).toEqual(['exception']);
  });
});
