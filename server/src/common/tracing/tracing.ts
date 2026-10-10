import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { HttpInstrumentation } from '@opentelemetry/instrumentation-http';
import { PgInstrumentation } from '@opentelemetry/instrumentation-pg';
import { UndiciInstrumentation } from '@opentelemetry/instrumentation-undici';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { ATTR_SERVICE_NAME } from '@opentelemetry/semantic-conventions';
import { loadConfiguration } from '../../config/configuration';

let runningSdk: NodeSDK | undefined;

/**
 * Starts OpenTelemetry. Must run before `pg`, `http`, or `undici` is first required, because
 * instrumentation works by patching those modules as they load; that is why `main.ts` and
 * `worker.ts` call this before their other imports.
 *
 * Spans go to Jaeger over OTLP HTTP. If Jaeger is down, the exporter drops spans and the app
 * keeps serving: tracing is never on the request's critical path. Tests never call this.
 */
export function startTracing(defaultServiceName: string): void {
  const { tracing } = loadConfiguration(process.env);
  if (tracing.isDisabled || runningSdk) return;

  runningSdk = new NodeSDK({
    resource: resourceFromAttributes({ [ATTR_SERVICE_NAME]: tracing.serviceName ?? defaultServiceName }),
    traceExporter: new OTLPTraceExporter({ url: `${tracing.exporterEndpoint.replace(/\/$/, '')}/v1/traces` }),
    instrumentations: [
      new HttpInstrumentation({
        // Health probes would otherwise produce a trace every few seconds.
        ignoreIncomingRequestHook: (request) => request.url === '/api/health',
      }),
      new UndiciInstrumentation(),
      new PgInstrumentation(),
    ],
  });
  runningSdk.start();
}

/** Flushes buffered spans. Called from `TracingModule` on application shutdown. */
export async function shutdownTracing(): Promise<void> {
  const sdk = runningSdk;
  runningSdk = undefined;
  await sdk?.shutdown();
}
