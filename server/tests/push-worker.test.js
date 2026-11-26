const assert = require('node:assert/strict');
const test = require('node:test');
const { createPushWorker, safeErrorCode } = require('../src/services/push-worker');
const { createPushWorkerRepository } = require('../src/repositories/push-worker-repository');

test('sends only generic push content, records tickets, and checks Expo receipts without claiming device delivery', async () => {
  const sent = [];
  const ticketCalls = [];
  const receiptCalls = [];
  const repository = {
    async claimDeliveryBatch() { return [
      { outbox_id: 'outbox-1', expo_push_token: 'ExponentPushToken[device-a]', title: 'sensitive title ignored', body: 'patient symptom ignored' },
      { outbox_id: 'outbox-2', expo_push_token: 'ExponentPushToken[device-b]' },
    ]; },
    async recordTicket(value) { ticketCalls.push(value); },
    async claimReceiptBatch() { return [{ outbox_id: 'outbox-1', ticket_id: 'ticket-1' }]; },
    async recordReceipt(value) { receiptCalls.push(value); },
  };
  const gateway = {
    async send(messages) { sent.push(...messages); return [{ status: 'ok', id: 'ticket-1' }, { status: 'error', details: { error: 'DeviceNotRegistered' } }]; },
    async getReceipts(ids) { assert.deepEqual(ids, ['ticket-1']); return { 'ticket-1': { status: 'ok' } }; },
  };
  const result = await createPushWorker({ repository, gateway }).runOnce();
  assert.deepEqual(sent, [
    { to: 'ExponentPushToken[device-a]', title: 'Nutrition Assistant', body: 'Bạn có thông báo mới. Mở ứng dụng để xem.' },
    { to: 'ExponentPushToken[device-b]', title: 'Nutrition Assistant', body: 'Bạn có thông báo mới. Mở ứng dụng để xem.' },
  ]);
  assert.deepEqual(ticketCalls, [
    { outboxId: 'outbox-1', ticketId: 'ticket-1' },
    { outboxId: 'outbox-2', errorCode: 'DeviceNotRegistered' },
  ]);
  assert.deepEqual(receiptCalls, [{ outboxId: 'outbox-1', status: 'ok' }]);
  assert.deepEqual(result, { claimed: 2, ticketAccepted: 1, receiptsChecked: 1, receiptOk: 1 });
});

test('returns temporary send and receipt failures to the durable retry queue', async () => {
  const events = [];
  const repository = {
    async claimDeliveryBatch() { return [{ outbox_id: 'outbox-1', expo_push_token: 'ExponentPushToken[device-a]' }]; },
    async recordTicket(value) { events.push(['ticket', value]); },
    async claimReceiptBatch() { return [{ outbox_id: 'outbox-2', ticket_id: 'ticket-2' }]; },
    async recordReceipt(value) { events.push(['receipt', value]); },
  };
  const gateway = { async send() { throw new Error('network unavailable'); }, async getReceipts() { throw new Error('network unavailable'); } };
  await createPushWorker({ repository, gateway }).runOnce();
  assert.deepEqual(events, [
    ['ticket', { outboxId: 'outbox-1', errorCode: 'PUSH_PROVIDER_UNAVAILABLE' }],
    ['receipt', { outboxId: 'outbox-2', status: 'error', errorCode: 'PUSH_PROVIDER_UNAVAILABLE' }],
  ]);
  assert.equal(safeErrorCode('invalid provider detail with secret', 'PUSH_ERROR'), 'PUSH_ERROR');
});

test('uses only service-role RPCs for leasing and recording delivery state', async () => {
  const calls = [];
  const client = { async rpc(name, args) { calls.push([name, args]); return { data: [], error: null }; } };
  const repository = createPushWorkerRepository({ privilegedClient: client });
  await repository.claimDeliveryBatch();
  await repository.recordTicket({ outboxId: 'outbox-id', ticketId: 'ticket-id' });
  await repository.claimReceiptBatch();
  await repository.recordReceipt({ outboxId: 'outbox-id', status: 'ok' });
  assert.deepEqual(calls.map(([name]) => name), ['claim_push_outbox', 'record_push_ticket', 'claim_push_receipts', 'record_push_receipt']);
  assert.throws(() => createPushWorkerRepository({}), /privileged/i);
});
