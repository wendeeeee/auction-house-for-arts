import { DomainError, ErrorCode } from '../../common/errors';

export class AssistantRateLimitedError extends DomainError {
  readonly code = ErrorCode.ASSISTANT_RATE_LIMITED;
  readonly httpStatus = 429;

  constructor(messagesPerHour: number) {
    super(`You have reached the limit of ${messagesPerHour} Concierge messages per hour. Please try again later.`, {
      messagesPerHour,
    });
  }
}

/** Also the answer for another user's session, so a session ID reveals nothing about anyone else. */
export class AssistantSessionNotFoundError extends DomainError {
  readonly code = ErrorCode.ASSISTANT_SESSION_NOT_FOUND;
  readonly httpStatus = 404;

  constructor(sessionId: string) {
    super('No Concierge conversation with this ID.', { sessionId });
  }
}
