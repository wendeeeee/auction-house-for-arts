import { AssistantLlm, ExtractRequest, ExtractResult, LlmMessage, LlmResponse, ToolDefinition } from './assistant-llm';

export type ScriptedStep = (messages: readonly LlmMessage[]) => Partial<LlmResponse> | Promise<Partial<LlmResponse>>;
export type ScriptedExtraction = (request: ExtractRequest) => unknown;

const SCRIPTED_USAGE = { inputTokens: 10, outputTokens: 5 };

/**
 * The fake model for tests. `complete` replays `steps` in order (repeating the last one) and
 * records every conversation it was sent; `extract` answers with `extraction`.
 */
export class ScriptedAssistantLlm implements AssistantLlm {
  readonly isAvailable = true;
  readonly provider = 'scripted';
  readonly model = 'scripted';
  readonly completions: LlmMessage[][] = [];
  readonly extractions: ExtractRequest[] = [];

  constructor(
    private readonly steps: readonly ScriptedStep[] = [],
    private readonly extraction: ScriptedExtraction = () => {
      throw new Error('No extraction scripted.');
    },
  ) {}

  async complete(messages: readonly LlmMessage[], _tools: readonly ToolDefinition[]): Promise<LlmResponse> {
    this.completions.push(structuredClone([...messages]));
    const step = this.steps[Math.min(this.completions.length - 1, this.steps.length - 1)];
    if (!step) throw new Error('No completion scripted.');
    return { content: null, toolCalls: [], usage: SCRIPTED_USAGE, ...(await step(messages)) };
  }

  async extract(request: ExtractRequest): Promise<ExtractResult> {
    this.extractions.push(request);
    return { data: await this.extraction(request), usage: SCRIPTED_USAGE };
  }
}

/** A model reply that calls one tool. */
export function callTool(name: string, args: unknown = {}, id = `call-${name}`): Partial<LlmResponse> {
  return { toolCalls: [{ id, name, arguments: typeof args === 'string' ? args : JSON.stringify(args) }] };
}

/** A final model reply. */
export function reply(content: string): Partial<LlmResponse> {
  return { content };
}
