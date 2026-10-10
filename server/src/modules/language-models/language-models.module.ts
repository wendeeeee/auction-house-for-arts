import { Module } from '@nestjs/common';
import { APP_CONFIG, AppConfig } from '../../config';
import { ASSISTANT_LLM, AssistantLlm } from './assistant-llm';
import { OpenAiAssistantLlm } from './openai-assistant-llm';
import { UnconfiguredAssistantLlm } from './unconfigured-assistant-llm';

export function createAssistantLlm(config: AppConfig): AssistantLlm {
  const openAi = config.languageModel.openAi;
  return openAi === null ? new UnconfiguredAssistantLlm() : new OpenAiAssistantLlm(openAi);
}

/** Shared by the Concierge (tool calling) and search (one structured extraction). */
@Module({
  providers: [{ provide: ASSISTANT_LLM, useFactory: createAssistantLlm, inject: [APP_CONFIG] }],
  exports: [ASSISTANT_LLM],
})
export class LanguageModelsModule {}
