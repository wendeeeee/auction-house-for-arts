import { ArgumentsHost, Catch, ExceptionFilter, Logger } from '@nestjs/common';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { RequestContext } from '../context';
import { buildErrorResponse } from './error-response';

/** Every error leaves the API in the `{ error: { code, message, details, correlationId } }` shape. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<FastifyRequest>();
    const reply = http.getResponse<FastifyReply>();
    const correlationId = RequestContext.correlationId() ?? (request.correlationId || null);

    const { status, body, isServerError } = buildErrorResponse(exception, correlationId);
    if (isServerError) {
      this.logger.error(
        { event: 'unhandled_error', correlationId, message: exception instanceof Error ? exception.message : String(exception) },
        exception instanceof Error ? exception.stack : undefined,
      );
    }
    if (reply.sent) return;
    void reply.status(status).header('content-type', 'application/json; charset=utf-8').send(body);
  }
}
