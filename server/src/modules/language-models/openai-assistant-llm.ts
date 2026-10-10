import OpenAI from 'openai';
import { OpenAiConfig } from '../../config';
import { AssistantLlm, ExtractRequest, ExtractResult, LlmMessage, LlmResponse, ToolDefinition } from './assistant-llm';

const REQUEST_TIMEOUT_MILLISECONDS = 30_000;
const MAXIMUM_REPLY_TOKENS = 1_200;
const MAXIMUM_EXTRACTION_TOKENS = 400;

/** OpenAI, or any OpenAI-compatible endpoint through `OPENAI_BASE_URL`. */
export class OpenAiAssistantLlm implements AssistantLlm {
  readonly isAvailable = true;
  readonly provider = 'openai';
  readonly model: string;
  private readonly client: OpenAI;

  constructor(config: OpenAiConfig) {
    this.model = config.model;
    this.client = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.baseUrl,
      timeout: REQUEST_TIMEOUT_MILLISECONDS,
      maxRetries: 1,
    });
  }

  async complete(messages: readonly LlmMessage[], tools: readonly ToolDefinition[]): Promise<LlmResponse> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: messages.map(toOpenAiMessage),
      tools: tools.map((tool) => ({
        type: 'function' as const,
        function: { name: tool.name, description: tool.description, parameters: tool.parameters },
      })),
      tool_choice: 'auto',
      max_completion_tokens: MAXIMUM_REPLY_TOKENS,
    });
    const message = response.choices[0]?.message;
    return {
      content: message?.content ?? null,
      toolCalls: (message?.tool_calls ?? []).flatMap((call) =>
        call.type === 'function' ? [{ id: call.id, name: call.function.name, arguments: call.function.arguments }] : [],
      ),
      usage: {
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
      },
    };
  }

  async extract({ system, user, name, schema }: ExtractRequest): Promise<ExtractResult> {
    const response = await this.client.chat.completions.create({
      model: this.model,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
      response_format: { type: 'json_schema', json_schema: { name, schema, strict: true } },
      max_completion_tokens: MAXIMUM_EXTRACTION_TOKENS,
    });
    const content = response.choices[0]?.message?.content;
    if (!content) throw new Error('The model returned no structured output.');
    return {
      data: JSON.parse(content) as unknown,
      usage: {
        inputTokens: response.usage?.prompt_tokens ?? 0,
        outputTokens: response.usage?.completion_tokens ?? 0,
      },
    };
  }
}

function toOpenAiMessage(message: LlmMessage): OpenAI.Chat.ChatCompletionMessageParam {
  if (message.role === 'tool') {
    return { role: 'tool', tool_call_id: message.toolCallId, content: message.content };
  }
  if (message.role === 'assistant') {
    return {
      role: 'assistant',
      content: message.content,
      ...(message.toolCalls?.length
        ? {
            tool_calls: message.toolCalls.map((call) => ({
              id: call.id,
              type: 'function' as const,
              function: { name: call.name, arguments: call.arguments },
            })),
          }
        : {}),
    };
  }
  return { role: message.role, content: message.content };
}
