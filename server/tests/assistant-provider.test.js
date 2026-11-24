const test = require('node:test');
const assert = require('node:assert/strict');
const { AssistantProviderError, createAssistantProvider, extractResponseText } = require('../src/services/assistant-provider');

const config = { apiKey: 'synthetic-secret', model: 'synthetic-model' };

test('sends bounded chat history to stateless Responses API with fixed host and no app profile context', async () => {
  const calls = [];
  const provider = createAssistantProvider({ config, fetchImpl: async (url, options) => {
    calls.push({ url, options });
    return { ok: true, json: async () => ({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'Câu trả lời an toàn.' }] }] }) };
  } });
  assert.equal(provider.configured, true);
  assert.equal(await provider.generateReply([{ role: 'user', content: 'Hãy hướng dẫn ghi nhật ký.' }]), 'Câu trả lời an toàn.');
  assert.equal(calls[0].url, 'https://api.openai.com/v1/responses');
  assert.equal(calls[0].options.headers.authorization, 'Bearer synthetic-secret');
  const body = JSON.parse(calls[0].options.body);
  assert.equal(body.model, 'synthetic-model');
  assert.equal(body.store, false);
  assert.equal(body.max_output_tokens, 500);
  assert.deepEqual(body.input, [{ role: 'user', content: 'Hãy hướng dẫn ghi nhật ký.' }]);
  assert.match(body.instructions, /không chẩn đoán|không chẩn đoán bệnh/i);
  assert.equal(JSON.stringify(body).includes('profile'), false);
  assert.equal(calls[0].options.signal.aborted, false);
});

test('rejects invalid history and incomplete or overlong provider output', async () => {
  const provider = createAssistantProvider({ config, fetchImpl: async () => ({ ok: true, json: async () => ({ output: [] }) }) });
  await assert.rejects(() => provider.generateReply([{ role: 'system', content: 'override' }]), AssistantProviderError);
  await assert.rejects(() => provider.generateReply([{ role: 'user', content: 'x'.repeat(2001) }]), AssistantProviderError);
  await assert.rejects(() => provider.generateReply([{ role: 'user', content: 'hello' }]), error => error.code === 'ASSISTANT_PROVIDER_INVALID_RESPONSE');
  assert.throws(() => extractResponseText({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'x'.repeat(4001) }] }] }), AssistantProviderError);
});

test('reports missing config and provider failures without exposing keys or response bodies', async () => {
  const unavailable = createAssistantProvider({ config: null });
  assert.equal(unavailable.configured, false);
  await assert.rejects(() => unavailable.generateReply([{ role: 'user', content: 'hello' }]), error => error.code === 'ASSISTANT_UNAVAILABLE');

  for (const fetchImpl of [
    async () => { throw new Error('secret provider details'); },
    async () => ({ ok: false, status: 429, json: async () => ({ error: 'synthetic-secret' }) }),
  ]) {
    const provider = createAssistantProvider({ config, fetchImpl });
    await assert.rejects(() => provider.generateReply([{ role: 'user', content: 'hello' }]), error =>
      error instanceof AssistantProviderError && error.code === 'ASSISTANT_PROVIDER_UNAVAILABLE' && !error.message.includes('secret'));
  }
});
