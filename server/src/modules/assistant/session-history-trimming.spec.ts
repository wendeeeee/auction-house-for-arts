import type { LlmMessage } from '../language-models';
import type { AssistantSession } from './assistant.types';
import { MAXIMUM_MODEL_MESSAGES, trimSessionHistory } from './session-history-trimming';

function sessionWith(messages: LlmMessage[], transcriptLength = 0): AssistantSession {
  return {
    id: 'session',
    userId: 'user',
    context: null,
    messages,
    transcript: Array.from({ length: transcriptLength }, (_, index) => ({ role: 'user' as const, text: `${index}`, createdAt: '' })),
    knownAuctionSlugs: [],
    createdAt: '',
    updatedAt: '',
  };
}

function turn(index: number): LlmMessage[] {
  return [
    { role: 'user', content: `question ${index}` },
    { role: 'assistant', content: null, toolCalls: [{ id: `call-${index}`, name: 'search_artworks', arguments: '{}' }] },
    { role: 'tool', toolCallId: `call-${index}`, content: '{}' },
    { role: 'assistant', content: `answer ${index}` },
  ];
}

describe('trimSessionHistory', () => {
  it('keeps the system prompt and cuts at a user turn, so tool calls keep their results', () => {
    const messages: LlmMessage[] = [{ role: 'system', content: 'system' }];
    for (let index = 0; index < 20; index += 1) messages.push(...turn(index));
    const trimmed = trimSessionHistory(sessionWith(messages)).messages;
    expect(trimmed[0]).toEqual({ role: 'system', content: 'system' });
    expect(trimmed[1]?.role).toBe('user');
    expect(trimmed.length).toBeLessThanOrEqual(MAXIMUM_MODEL_MESSAGES + 1);
    expect(trimmed.at(-1)).toEqual({ role: 'assistant', content: 'answer 19' });
  });

  it('keeps a page-change note right before the first kept turn', () => {
    const messages: LlmMessage[] = [{ role: 'system', content: 'system' }];
    for (let index = 0; index < 10; index += 1) messages.push(...turn(index));
    messages.push({ role: 'system', content: 'CURRENT PAGE changed' });
    for (let index = 10; index < 19; index += 1) messages.push(...turn(index));
    const trimmed = trimSessionHistory(sessionWith(messages)).messages;
    expect(trimmed[1]).toEqual({ role: 'system', content: 'CURRENT PAGE changed' });
  });

  it('leaves a short history alone and caps the transcript', () => {
    const messages: LlmMessage[] = [{ role: 'system', content: 'system' }, ...turn(0)];
    const trimmed = trimSessionHistory(sessionWith(messages, 70));
    expect(trimmed.messages).toEqual(messages);
    expect(trimmed.transcript).toHaveLength(60);
    expect(trimmed.transcript[0]?.text).toBe('10');
  });
});
