import { Logger } from '@nestjs/common';
import type { FastifyInstance } from 'fastify';

const logger = new Logger('Http');

/** One access-log line per response, carrying the correlation ID explicitly (onResponse may run outside the context). */
export function registerRequestLoggingHook(fastify: FastifyInstance): void {
  fastify.addHook('onResponse', (request, reply, done) => {
    logger.log({
      event: 'request_completed',
      correlationId: request.correlationId,
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      durationMilliseconds: Math.round(reply.elapsedTime),
    });
    done();
  });
}
