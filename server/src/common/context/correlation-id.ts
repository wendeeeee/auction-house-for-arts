import { randomUUID } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { RequestContext } from './request-context';

export const CORRELATION_ID_HEADER = 'x-request-id';

const ACCEPTABLE_CORRELATION_ID = /^[A-Za-z0-9._:-]{8,128}$/;

declare module 'fastify' {
  interface FastifyRequest {
    correlationId: string;
  }
}

export function chooseCorrelationId(incoming: string | string[] | undefined): string {
  return typeof incoming === 'string' && ACCEPTABLE_CORRELATION_ID.test(incoming) ? incoming : randomUUID();
}


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
