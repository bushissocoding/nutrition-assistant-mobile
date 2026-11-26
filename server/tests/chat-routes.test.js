const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createChatRouter } = require('../src/routes/chat');

const user = { id: '7f35a680-01cf-4db5-b92c-ea734130c17c' };
const appointmentId = 'e56e881f-9514-45a3-a404-9d9d849b1a6a';
const clientMessageId = '56a3227e-742e-4713-993c-3f78c41acd49';

async function withServer(router, callback) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.auth = { user }; req.userDatabase = { scoped: true }; next(); });
  app.use(router);
  const server = await new Promise(resolve => { const instance = app.listen(0, '127.0.0.1', () => resolve(instance)); });
  try { await callback(`http://127.0.0.1:${server.address().port}`); }
  finally { await new Promise(resolve => server.close(resolve)); }
}

test('assistant route persists consent and sends only bounded, server-loaded history to the provider', async () => {
  const calls = [];
  const repository = {
    async recordAssistantConsent(input) { calls.push(['consent', input]); return { version: input.version, accepted: input.accepted }; },
    async beginAssistantTurn(input) { calls.push(['begin', input]); return { threadId: 'thread-1', turn: { id: 'turn-1', userMessage: input.userMessage, status: 'pending' }, shouldGenerate: true, replayed: false }; },
    async getAssistantHistory(input) { calls.push(['history', input]); return [{ role: 'user', content: 'previous' }, { role: 'assistant', content: 'reply' }]; },
    async completeAssistantTurn(input) { calls.push(['complete', input]); return { id: 'turn-1', userMessage: 'current', assistantMessage: 'safe answer', status: 'completed' }; },
    async failAssistantTurn() { assert.fail('successful provider response must not fail'); },
  };
  const assistantProvider = { configured: true, async generateReply(history) { calls.push(['provider', history]); return 'safe answer'; } };
  await withServer(createChatRouter({ repository, assistantProvider, requireCurrentConsent: (_req, _res, next) => next() }), async base => {
    const consent = await fetch(`${base}/assistant/consent`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ version: 'ai-assistant-processing-v1', accepted: true }) });
    assert.equal(consent.status, 200);
    const response = await fetch(`${base}/assistant/turns`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ clientMessageId, message: 'current' }) });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).turn.assistantMessage, 'safe answer');
  });
  assert.deepEqual(calls.map(([name]) => name), ['consent', 'begin', 'history', 'provider', 'complete']);
  assert.deepEqual(calls[3][1], [
    { role: 'user', content: 'previous' }, { role: 'assistant', content: 'reply' }, { role: 'user', content: 'current' },
  ]);
  assert.equal(calls[0][1].db.scoped, true);
});

test('assistant route refuses input before provider configuration, consent and payload checks', async () => {
  const repository = { async beginAssistantTurn() { throw Object.assign(new Error('no consent'), { status: 403, code: 'AI_ASSISTANT_CONSENT_REQUIRED' }); } };
  const unavailable = createChatRouter({ repository, assistantProvider: { configured: false }, requireCurrentConsent: (_req, _res, next) => next() });
  await withServer(unavailable, async base => {
    const notConfigured = await fetch(`${base}/assistant/turns`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ clientMessageId, message: 'hello' }) });
    assert.equal(notConfigured.status, 503);
  });
  const configured = createChatRouter({ repository, assistantProvider: { configured: true }, requireCurrentConsent: (_req, _res, next) => next() });
  await withServer(configured, async base => {
    const malformed = await fetch(`${base}/assistant/turns`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ clientMessageId, message: '   ' }) });
    assert.equal(malformed.status, 400);
    const noConsent = await fetch(`${base}/assistant/turns`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ clientMessageId, message: 'hello' }) });
    assert.equal(noConsent.status, 403);
  });
});

test('appointment chat validates identity and uses the same API for history and idempotent send', async () => {
  const calls = [];
  const repository = {
    async getAppointmentMessages(input) { calls.push(['read', input]); return { appointmentId, items: [] }; },
    async sendAppointmentMessage(input) { calls.push(['send', input]); return { message: { id: 'message-1', body: input.body }, replayed: false }; },
  };
  await withServer(createChatRouter({ repository, assistantProvider: { configured: false }, requireCurrentConsent: (_req, _res, next) => next() }), async base => {
    const read = await fetch(`${base}/appointments/${appointmentId}/messages`);
    assert.equal(read.status, 200);
    const sent = await fetch(`${base}/appointments/${appointmentId}/messages`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ clientMessageId, body: 'Xin chào' }) });
    assert.equal(sent.status, 201);
    const invalid = await fetch(`${base}/appointments/not-a-uuid/messages`);
    assert.equal(invalid.status, 404);
  });
  assert.deepEqual(calls.map(([name]) => name), ['read', 'send']);
  assert.equal(calls[1][1].userId, user.id);
});
