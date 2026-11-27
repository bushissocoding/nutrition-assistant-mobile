const assert = require('node:assert/strict');
const test = require('node:test');
const { createPushWorker } = require('../src/services/push-worker');

function createRepository(overrides = {}) {
  return {
    async claimDeliveryBatch() { return [{ outbox_id: 'outbox-1', expo_push_token: 'ExponentPushToken[device-a]', lease_token: 'lease-a' }]; },
    async beginDeliveryBatch() { return true; },
    async renewDeliveryLease() { return true; },
    async recordTicket() {},
    async claimReceiptBatch() { return []; },
    async renewReceiptLease() { return true; },
    async recordReceipt() {},
    ...overrides,
  };
}

test('fences the send before calling Expo and renews its lease while the request is pending', async () => {
  const events = [];
  let renewals = 0;
  let renewalsWhenFinished = 0;
  const repository = createRepository({
    async beginDeliveryBatch(items) {
      events.push('begin');
      assert.deepEqual(items.map(item => item.lease_token), ['lease-a']);
      return true;
    },
    async renewDeliveryLease({ outboxId, leaseToken }) {
      assert.deepEqual({ outboxId, leaseToken }, { outboxId: 'outbox-1', leaseToken: 'lease-a' });
      renewals += 1;
      return true;
    },
    async recordTicket(value) { events.push(['record', value]); },
  });
  const gateway = {
    async send(_messages, { signal } = {}) {
      events.push('send');
      assert.equal(signal.aborted, false);
      await new Promise(resolve => setTimeout(resolve, 25));
      renewalsWhenFinished = renewals;
      return [{ status: 'ok', id: 'ticket-1' }];
    },
    async getReceipts() { return {}; },
  };

  await createPushWorker({ repository, gateway, heartbeatIntervalMs: 5 }).runOnce();
  const renewalsAfterRun = renewals;
  await new Promise(resolve => setTimeout(resolve, 15));

  assert.ok(events.indexOf('begin') < events.indexOf('send'));
  assert.ok(renewalsWhenFinished > 0);
  assert.equal(renewals, renewalsAfterRun, 'heartbeat stops after the leased work completes');
  assert.deepEqual(events.at(-1), ['record', { outboxId: 'outbox-1', leaseToken: 'lease-a', ticketId: 'ticket-1' }]);
});

test('does not send when the database no longer grants the whole lease batch', async () => {
  let sendCalls = 0;
  const repository = createRepository({ async beginDeliveryBatch() { return false; } });
  const gateway = {
    async send() { sendCalls += 1; return []; },
    async getReceipts() { return {}; },
  };

  await createPushWorker({ repository, gateway }).runOnce();
  assert.equal(sendCalls, 0);
});

test('records an unknown delivery outcome instead of automatically retrying an ambiguous send', async () => {
  const recorded = [];
  const repository = createRepository({ async recordTicket(value) { recorded.push(value); } });
  const gateway = {
    async send() { throw new Error('connection closed after request was sent'); },
    async getReceipts() { return {}; },
  };

  await createPushWorker({ repository, gateway }).runOnce();
  assert.deepEqual(recorded, [{ outboxId: 'outbox-1', leaseToken: 'lease-a', errorCode: 'PUSH_DELIVERY_UNKNOWN' }]);
});

test('renews receipt leases and fences receipt writes with the claim token', async () => {
  let renewal = null;
  let receipt = null;
  const repository = createRepository({
    async claimDeliveryBatch() { return []; },
    async claimReceiptBatch() { return [{ outbox_id: 'outbox-2', ticket_id: 'ticket-2', lease_token: 'lease-b' }]; },
    async renewReceiptLease(value) { renewal = value; return true; },
    async recordReceipt(value) { receipt = value; },
  });
  const gateway = {
    async send() { return []; },
    async getReceipts() { await new Promise(resolve => setTimeout(resolve, 15)); return { 'ticket-2': { status: 'ok' } }; },
  };

  await createPushWorker({ repository, gateway, heartbeatIntervalMs: 5 }).runOnce();
  assert.deepEqual(renewal, { outboxId: 'outbox-2', leaseToken: 'lease-b' });
  assert.deepEqual(receipt, { outboxId: 'outbox-2', leaseToken: 'lease-b', status: 'ok' });
});
