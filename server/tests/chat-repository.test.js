const test = require('node:test');
const assert = require('node:assert/strict');
const { createChatRepository, ChatRepositoryError } = require('../src/repositories/chat-repository');

const patientId = '7f35a680-01cf-4db5-b92c-ea734130c17c';
const providerId = '82b4fefe-81fd-44f1-8be0-905e33f10b16';
const appointmentId = 'e56e881f-9514-45a3-a404-9d9d849b1a6a';
const threadId = 'e0998ee1-15ec-4467-86de-a01f12a74871';
const turnId = '56a3227e-742e-4713-993c-3f78c41acd49';

function query(resolved, calls, table) {
  const builder = {};
  for (const name of ['select', 'eq', 'neq', 'order', 'limit']) builder[name] = (...args) => { calls.push([table, name, ...args]); return builder; };
  builder.maybeSingle = async () => resolved;
  builder.then = (resolve, reject) => Promise.resolve(resolved).then(resolve, reject);
  return builder;
}

test('assistant repository creates an owner thread, lists bounded turns and replays transaction RPC state', async () => {
  const calls = [];
  const db = {
    async rpc(name, args) {
      calls.push(['rpc', name, args]);
      if (name === 'get_or_create_assistant_thread') return { data: { threadId, aiConsent: true }, error: null };
      if (name === 'begin_assistant_turn') return { data: { threadId, turn: { id: turnId, status: 'pending' }, shouldGenerate: true }, error: null };
      return { data: { id: turnId, requestKey: turnId, userMessage: 'Hỏi', assistantMessage: 'Đã xong', status: 'completed', createdAt: '2026-01-01T00:00:00Z' }, error: null };
    },
    from(table) { return query({ data: [{ id: turnId, request_key: '56a3227e-742e-4713-993c-3f78c41acd49', user_message: 'Hỏi', assistant_message: 'Đáp', status: 'completed', created_at: '2026-01-01T00:00:00Z' }], error: null }, calls, table); },
  };
  const repository = createChatRepository();
  const thread = await repository.getAssistantThread({ db, userId: patientId });
  assert.equal(thread.threadId, threadId);
  assert.equal(thread.aiConsent, true);
  assert.equal(thread.turns[0].assistantMessage, 'Đáp');
  assert.deepEqual(await repository.beginAssistantTurn({ db, requestKey: turnId, userMessage: 'Hỏi' }), { threadId, turn: { id: turnId, status: 'pending' }, shouldGenerate: true });
  await repository.completeAssistantTurn({ db, turnId, message: 'Đã xong' });
  assert.equal(calls.find(call => call[1] === 'begin_assistant_turn')[2].p_user_message, 'Hỏi');
  assert.equal(calls.filter(call => call[0] === 'assistant_turns' && call[1] === 'limit')[0][2], 100);
});

test('appointment message reads require participant and eligible status; send is an idempotent RPC', async () => {
  const calls = [];
  const appointment = { id: appointmentId, status: 'confirmed', patient_user_id: patientId, provider_id: providerId };
  const row = { id: 'message-1', appointment_id: appointmentId, sender_user_id: patientId, client_message_id: turnId, body: 'Xin chào', created_at: '2026-01-01T00:00:00Z' };
  const db = {
    from(table) {
      if (table === 'appointments') return query({ data: appointment, error: null }, calls, table);
      if (table === 'care_providers') return query({ data: { id: providerId }, error: null }, calls, table);
      if (table === 'appointment_messages') return query({ data: [row], error: null }, calls, table);
      throw new Error(`unexpected table ${table}`);
    },
    async rpc(name, args) { calls.push(['rpc', name, args]); return { data: { message: row, replayed: true }, error: null }; },
  };
  const repository = createChatRepository();
  const conversation = await repository.getAppointmentMessages({ db, userId: patientId, appointmentId });
  assert.equal(conversation.items[0].body, 'Xin chào');
  assert.equal(calls.some(call => call[0] === 'care_providers'), false);
  const sent = await repository.sendAppointmentMessage({ db, appointmentId, clientMessageId: turnId, body: 'Xin chào' });
  assert.equal(sent.replayed, true);
  assert.equal(calls.find(call => call[1] === 'send_appointment_message')[2].p_appointment_id, appointmentId);
});

test('appointment chat hides unrelated users and rejects closed bookings', async () => {
  const calls = [];
  const repository = createChatRepository();
  const db = { from(table) {
    if (table === 'appointments') return query({ data: { id: appointmentId, status: 'cancelled', patient_user_id: patientId, provider_id: providerId }, error: null }, calls, table);
    if (table === 'care_providers') return query({ data: null, error: null }, calls, table);
    throw new Error(`unexpected table ${table}`);
  } };
  assert.equal(await repository.getAppointmentMessages({ db, userId: '6a06b161-0f47-4a89-958f-53131ec508af', appointmentId }), null);
  await assert.rejects(() => repository.getAppointmentMessages({ db, userId: patientId, appointmentId }), error =>
    error instanceof ChatRepositoryError && error.code === 'APPOINTMENT_CHAT_UNAVAILABLE');
});
