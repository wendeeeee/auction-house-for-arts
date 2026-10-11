/** Injection token for the active `AssistantLlm`: OpenAI, the offline stand-in, or a scripted fake in tests. */
export const ASSISTANT_LLM = Symbol('ASSISTANT_LLM');

export interface ToolDefinition {
  readonly name: string;
  readonly description: string;
  /** JSON schema of the arguments. */
  readonly parameters: Record<string, unknown>;
}

export interface LlmToolCall {
  readonly id: string;
  readonly name: string;
  /** Raw JSON text from the model; validated by the tool before use. */
  readonly arguments: string;
}

export type LlmMessage =
  | { readonly role: 'system'; readonly content: string }
  | { readonly role: 'user'; readonly content: string }
  | { readonly role: 'assistant'; readonly content: string | null; readonly toolCalls?: readonly LlmToolCall[] }
  | { readonly role: 'tool'; readonly toolCallId: string; readonly content: string };

export interface LlmUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
}

export interface LlmResponse {
  readonly content: string | null;
  readonly toolCalls: readonly LlmToolCall[];
  readonly usage: LlmUsage;
}

export interface ExtractRequest {
  readonly system: string;
  readonly user: string;
  readonly name: string;
  /** Strict JSON schema the reply must match. */
  readonly schema: Record<string, unknown>;
}

export interface ExtractResult {
  readonly data: unknown;
  readonly usage: LlmUsage;
}

/**
 * Provider-neutral model interface. Only the OpenAI implementation knows the SDK, so the agent
 * loop, the search interpreter, and their tests never depend on it. Never call it inside a
 * database transaction: it is a network call.
 */
export interface AssistantLlm {
  /** False for the offline stand-in: callers skip the model instead of failing. */
  readonly isAvailable: boolean;
  readonly provider: string;
  readonly model: string;
  /** One step of tool calling, for the Concierge loop. */
  complete(messages: readonly LlmMessage[], tools: readonly ToolDefinition[]): Promise<LlmResponse>;
  /** One constrained call returning JSON, for single-shot extraction. */
  extract(request: ExtractRequest): Promise<ExtractResult>;
}
