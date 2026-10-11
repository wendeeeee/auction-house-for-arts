import { AssistantLlm, ExtractResult, LlmResponse } from './assistant-llm';
import { AssistantUnavailableError } from './language-models.errors';

/** Stands in without OPENAI_API_KEY, so the app boots, the Concierge reports offline, and search uses keywords. */
export class UnconfiguredAssistantLlm implements AssistantLlm {
  readonly isAvailable = false;
  readonly provider = 'none';
  readonly model = 'none';

  complete(): Promise<LlmResponse> {
    return Promise.reject(new AssistantUnavailableError('not_configured'));
  }

  extract(): Promise<ExtractResult> {
    return Promise.reject(new AssistantUnavailableError('not_configured'));
  }
}
