import { loadConfiguration } from '../../config';
import { createAssistantLlm } from './language-models.module';
import { OpenAiAssistantLlm } from './openai-assistant-llm';
import { UnconfiguredAssistantLlm } from './unconfigured-assistant-llm';

const DATABASE_URL = 'postgres://art_auction:art_auction@localhost:55442/art_auction';

describe('createAssistantLlm', () => {
  it('is offline without an API key, and every call answers ASSISTANT_UNAVAILABLE', async () => {
    const llm = createAssistantLlm(loadConfiguration({ DATABASE_URL }));
    expect(llm).toBeInstanceOf(UnconfiguredAssistantLlm);
    expect(llm.isAvailable).toBe(false);
    await expect(llm.complete([], [])).rejects.toMatchObject({ code: 'ASSISTANT_UNAVAILABLE', httpStatus: 503 });
    await expect(llm.extract({ system: '', user: '', name: 'x', schema: {} })).rejects.toMatchObject({
      code: 'ASSISTANT_UNAVAILABLE',
    });
  });

  it('uses OpenAI with the configured model when a key is set, without calling it', () => {
    const llm = createAssistantLlm(loadConfiguration({ DATABASE_URL, OPENAI_API_KEY: 'sk-example', OPENAI_MODEL: 'local-model' }));
    expect(llm).toBeInstanceOf(OpenAiAssistantLlm);
    expect(llm).toMatchObject({ isAvailable: true, provider: 'openai', model: 'local-model' });
  });
});
