const assert = require('node:assert/strict');
const test = require('node:test');
const { EXPO_PUSH_RECEIPTS_URL, EXPO_PUSH_SEND_URL, ExpoPushError, createExpoPushGateway } = require('../src/services/expo-push-gateway');

test('sends bounded batches and reads Expo receipts using server authorization', async () => {
  const calls = [];
  const gateway = createExpoPushGateway({ config: { accessToken: 'server-access-token' }, fetchImpl: async (url, options) => {
    calls.push({ url, options });
    return { ok: true, async json() { return { data: url === EXPO_PUSH_SEND_URL ? [{ status: 'ok', id: 'ticket-1' }] : { 'ticket-1': { status: 'ok' } } }; } };
  } });
  assert.equal(gateway.configured, true);
  const messages = [{ to: 'ExponentPushToken[device-token]', title: 'Nutrition Assistant', body: 'Bạn có thông báo mới. Mở ứng dụng để xem.' }];
  assert.deepEqual(await gateway.send(messages), [{ status: 'ok', id: 'ticket-1' }]);
  assert.deepEqual(await gateway.getReceipts(['ticket-1']), { 'ticket-1': { status: 'ok' } });
  assert.deepEqual(calls.map(call => call.url), [EXPO_PUSH_SEND_URL, EXPO_PUSH_RECEIPTS_URL]);
  assert.equal(calls[0].options.headers.Authorization, 'Bearer server-access-token');
  assert.deepEqual(JSON.parse(calls[1].options.body), { ids: ['ticket-1'] });
});

test('fails explicitly for missing config, network errors, bad responses and invalid batch sizes', async () => {
  const unconfigured = createExpoPushGateway({ config: null, fetchImpl: async () => { throw new Error('should not fetch'); } });
  assert.equal(unconfigured.configured, false);
  await assert.rejects(unconfigured.send([{ to: 'ExponentPushToken[x]' }]), error => error instanceof ExpoPushError && error.code === 'PUSH_PROVIDER_UNAVAILABLE');
  const brokenNetwork = createExpoPushGateway({ config: { accessToken: 'server-token' }, fetchImpl: async () => { throw new Error('secret transport details'); } });
  await assert.rejects(brokenNetwork.send([{ to: 'ExponentPushToken[x]' }]), error => error.code === 'PUSH_DELIVERY_UNKNOWN' && !error.message.includes('secret transport'));
  const invalidResponse = createExpoPushGateway({ config: { accessToken: 'server-token' }, fetchImpl: async () => ({ ok: true, async json() { return { data: [] }; } }) });
  await assert.rejects(invalidResponse.send([{ to: 'ExponentPushToken[x]' }]), error => error.code === 'PUSH_DELIVERY_UNKNOWN');
  await assert.rejects(invalidResponse.send([]), error => error.code === 'PUSH_REQUEST_INVALID');
});

test('aborts Expo requests that exceed the worker lease window', async () => {
  let observedSignal;
  const gateway = createExpoPushGateway({
    config: { accessToken: 'server-token' },
    requestTimeoutMs: 5,
    fetchImpl: async (_url, options) => {
      observedSignal = options.signal;
      return new Promise((_resolve, reject) => {
        options.signal.addEventListener('abort', () => reject(new Error('request aborted')), { once: true });
      });
    },
  });

  await assert.rejects(gateway.send([{ to: 'ExponentPushToken[x]' }]), error => error.code === 'PUSH_DELIVERY_UNKNOWN');
  assert.equal(observedSignal.aborted, true);
});

test('settles even if an injected fetch ignores the abort signal', async () => {
  const gateway = createExpoPushGateway({
    config: { accessToken: 'server-token' },
    requestTimeoutMs: 5,
    fetchImpl: async () => new Promise(() => {}),
  });
  await assert.rejects(gateway.send([{ to: 'ExponentPushToken[x]' }]), error => error.code === 'PUSH_DELIVERY_UNKNOWN');
});
