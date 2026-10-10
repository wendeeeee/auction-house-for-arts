import { BadRequestException, ForbiddenException, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { DomainError, ErrorCode, InvariantViolationError, UnauthenticatedError, ValidationFailedError } from '../errors';
import { GENERIC_SERVER_ERROR_MESSAGE, buildErrorResponse } from './error-response';

const CORRELATION_ID = 'test-correlation-0001';

/** Stands in for a feature's business-rule error (e.g. BID_TOO_LOW later). */
class ExampleConflictError extends DomainError {
  readonly code = ErrorCode.REQUEST_REJECTED;
  readonly httpStatus = 409;
}

describe('buildErrorResponse', () => {
  describe('domain errors', () => {
    it('keeps the code, status, message, and details', () => {
      const error = new ExampleConflictError('The minimum next bid is $110.00.', { minimumNextBidCents: 11_000 });

      expect(buildErrorResponse(error, CORRELATION_ID)).toEqual({
        status: 409,
        isServerError: false,
        body: {
          error: {
            code: ErrorCode.REQUEST_REJECTED,
            message: 'The minimum next bid is $110.00.',
            details: { minimumNextBidCents: 11_000 },
            correlationId: CORRELATION_ID,
          },
        },
      });
    });

    it('always includes details, as an empty object when there are none', () => {
      const response = buildErrorResponse(new UnauthenticatedError('Unknown demo user.'), CORRELATION_ID);
      expect(response.status).toBe(401);
      expect(response.body.error.details).toEqual({});
    });

    it('hides the message and details of a 500 domain error (an invariant violation is our bug)', () => {
      const error = new InvariantViolationError('Ledger for auction 42 is unbalanced by 3 cents.', { auctionId: 42 });

      expect(buildErrorResponse(error, CORRELATION_ID)).toEqual({
        status: 500,
        isServerError: true,
        body: {
          error: { code: ErrorCode.INTERNAL_ERROR, message: GENERIC_SERVER_ERROR_MESSAGE, details: {}, correlationId: CORRELATION_ID },
        },
      });
    });
  });

  describe('validation errors', () => {
    it('maps to 400 VALIDATION_FAILED with field errors', () => {
      const error = new ValidationFailedError([{ path: 'medium', message: 'Invalid option' }]);

      expect(buildErrorResponse(error, CORRELATION_ID)).toEqual({
        status: 400,
        isServerError: false,
        body: {
          error: {
            code: ErrorCode.VALIDATION_FAILED,
            message: 'Request validation failed.',
            details: { fieldErrors: [{ path: 'medium', message: 'Invalid option' }] },
            correlationId: CORRELATION_ID,
          },
        },
      });
    });
  });

  describe('framework errors', () => {
    it.each([
      [new NotFoundException('Cannot GET /api/nope'), 404, ErrorCode.ROUTE_NOT_FOUND],
      [new BadRequestException('Body is not valid JSON'), 400, ErrorCode.VALIDATION_FAILED],
      [new ForbiddenException(), 403, ErrorCode.FORBIDDEN],
    ])('maps Nest %p to %p %s', (exception, status, code) => {
      const response = buildErrorResponse(exception, CORRELATION_ID);
      expect(response.status).toBe(status);
      expect(response.body.error.code).toBe(code);
      expect(response.body.error.message).toBe(exception.message);
      expect(response.isServerError).toBe(false);
    });

    it('maps a Fastify 4xx error (which carries statusCode) to REQUEST_REJECTED', () => {
      const fastifyError = Object.assign(new Error('Unsupported Media Type: text/csv'), {
        statusCode: 415,
        code: 'FST_ERR_CTP_INVALID_MEDIA_TYPE',
      });

      const response = buildErrorResponse(fastifyError, CORRELATION_ID);
      expect(response.status).toBe(415);
      expect(response.body.error.code).toBe(ErrorCode.REQUEST_REJECTED);
    });

    it('treats a framework 5xx as unexpected, without its message', () => {
      const response = buildErrorResponse(new ServiceUnavailableException('pool exhausted at 10.0.0.5'), CORRELATION_ID);
      expect(response.status).toBe(500);
      expect(response.body.error.code).toBe(ErrorCode.INTERNAL_ERROR);
      expect(JSON.stringify(response.body)).not.toContain('10.0.0.5');
    });
  });

  describe('unexpected errors', () => {
    it('returns a generic 500 that leaks nothing about the cause', () => {
      const error = new Error('password authentication failed for user "art_auction" at 10.0.0.5:5432');

      const response = buildErrorResponse(error, CORRELATION_ID);

      expect(response).toEqual({
        status: 500,
        isServerError: true,
        body: {
          error: { code: ErrorCode.INTERNAL_ERROR, message: GENERIC_SERVER_ERROR_MESSAGE, details: {}, correlationId: CORRELATION_ID },
        },
      });
      expect(JSON.stringify(response.body)).not.toMatch(/password|art_auction|10\.0\.0\.5/);
    });

    it.each([['a string'], [undefined], [null], [{ statusCode: 404 }]])('handles a thrown non-Error value: %p', (thrown) => {
      const response = buildErrorResponse(thrown, null);
      expect(response.status).toBe(500);
      expect(response.body.error).toEqual({
        code: ErrorCode.INTERNAL_ERROR,
        message: GENERIC_SERVER_ERROR_MESSAGE,
        details: {},
        correlationId: null,
      });
    });
  });
});
