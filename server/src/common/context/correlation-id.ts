import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { RequestContext } from './request-context';

export const CORRELATION_ID_HEADER = 'x-request-id';

/** A client-supplied ID is kept for tracing only if it has a safe shape (no log injection). */
const ACCEPTABLE_CORRELATION_ID = /^[A-Za-z0-9._:-]{8,128}$/;

declare module 'fastify' {
  interface FastifyRequest {
    correlationId: string;
  }
}

export function chooseCorrelationId(incoming: string | string[] | undefined): string {
  return typeof incoming === 'string' && ACCEPTABLE_CORRELATION_ID.test(incoming) ? incoming : randomUUID();
}

/**
 * Gives every request a correlation ID: taken from `X-Request-Id` or generated, echoed in the
 * response header, stored on the request, and held in AsyncLocalStorage.
 *
 * The context is entered twice. `onRequest` covers everything up to body parsing; body parsing
 * is driven by stream events, which can lose the async context, so `preHandler` enters it
 * again right before guards and the handler run. The ID on the request object is a fallback
 * for code that runs outside both (Fastify's own errors).
 */
export function registerCorrelationIdHooks(fastify: FastifyInstance): void {
  fastify.decorateRequest('correlationId', '');

  fastify.addHook('onRequest', (request, reply, done) => {
    request.correlationId = chooseCorrelationId(request.headers[CORRELATION_ID_HEADER]);
    void reply.header(CORRELATION_ID_HEADER, request.correlationId);
    RequestContext.run({ correlationId: request.correlationId }, done);
  });

  fastify.addHook('preHandler', (request, _reply, done) => {
    RequestContext.run({ correlationId: request.correlationId }, done);
  });
}
