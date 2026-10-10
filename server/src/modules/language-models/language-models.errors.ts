import { DomainError, ErrorCode } from '../../common/errors';

/** No model is configured, or the provider failed. The provider's message goes to the log as the cause. */
export class AssistantUnavailableError extends DomainError {
  readonly code = ErrorCode.ASSISTANT_UNAVAILABLE;
  readonly httpStatus = 503;

  constructor(reason: 'not_configured' | 'provider_failed', cause?: unknown) {
    super(
      reason === 'not_configured'
        ? 'The Concierge is not configured on this server. Set OPENAI_API_KEY to enable it.'
        : 'The Concierge is having trouble right now. Please try again in a moment.',
      { reason },
      { cause },
    );
  }
}
