'use strict';

const assert = require('node:assert/strict');
const test = require('node:test');
const { STORAGE_PREFIX, createPushDeviceStorage } = require('./push-device-storage.cjs');

function memoryStorage() {
  const values = new Map();
  return { values, async getItemAsync(key) { return values.get(key) ?? null; }, async setItemAsync(key, value) { values.set(key, value); }, async deleteItemAsync(key) { values.delete(key); } };
}

test('stores push token per account and rejects malformed local data', async () => {
  const storage = memoryStorage();
  const devices = createPushDeviceStorage({ storage });
  const device = { expoPushToken: 'ExponentPushToken[device-token]', platform: 'ios' };
  await devices.set('account-a', device);
  assert.deepEqual(await devices.get('account-a'), device);
  assert.equal(await devices.get('account-b'), null);
  storage.values.set(STORAGE_PREFIX + 'account-a', '{bad');
  assert.equal(await devices.get('account-a'), null);
  assert.equal(storage.values.has(STORAGE_PREFIX + 'account-a'), false);
});

test('invalid account IDs and push tokens cannot be stored', async () => {
  const devices = createPushDeviceStorage({ storage: memoryStorage() });
  await assert.rejects(devices.set('../account', { expoPushToken: 'ExponentPushToken[device-token]', platform: 'ios' }), /valid account ID/i);
  await assert.rejects(devices.set('account-a', { expoPushToken: 'not-a-token', platform: 'ios' }), /invalid/i);
});
