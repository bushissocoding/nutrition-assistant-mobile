'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { STORAGE_KEY, createNotificationStateStorage } = require('./notification-state-storage.cjs');

const initialItems = [
  { id: 'sample-a', title: 'A', unread: true },
  { id: 'sample-b', title: 'B', unread: false },
];

function memoryStorage(raw = null) {
  const values = new Map(raw === null ? [] : [[STORAGE_KEY, raw]]);
  return {
    values,
    async getItemAsync(key) { return values.get(key) ?? null; },
    async setItemAsync(key, value) { values.set(key, value); },
    async deleteItemAsync(key) { values.delete(key); },
  };
}

test('restores read flags and stores only known IDs and booleans', async () => {
  const storage = memoryStorage();
  const state = createNotificationStateStorage({ storage, initialItems });
  await state.save([{ ...initialItems[0], unread: false }, { ...initialItems[1], unread: true }]);

  assert.equal(storage.values.get(STORAGE_KEY), '[{"id":"sample-a","unread":false},{"id":"sample-b","unread":true}]');
  const restored = await state.load();
  assert.deepEqual(restored.items.map(({ id, unread }) => ({ id, unread })), [
    { id: 'sample-a', unread: false }, { id: 'sample-b', unread: true },
  ]);
  assert.equal(restored.items[0].title, 'A');
});

test('uses initial sample state and deletes malformed or outdated saved flags', async () => {
  const storage = memoryStorage('[{"id":"old-sample","unread":false}]');
  const state = createNotificationStateStorage({ storage, initialItems });

  const restored = await state.load();
  assert.deepEqual(restored.items, initialItems);
  assert.match(restored.warning, /không hợp lệ/i);
  assert.equal(storage.values.has(STORAGE_KEY), false);
});

test('propagates SecureStore failures so the app can show a retry state', async () => {
  const storage = {
    async getItemAsync() { throw new Error('SecureStore unavailable'); },
    async setItemAsync() { throw new Error('SecureStore unavailable'); },
    async deleteItemAsync() { throw new Error('SecureStore unavailable'); },
  };
  const state = createNotificationStateStorage({ storage, initialItems });

  await assert.rejects(state.load(), /SecureStore unavailable/);
  await assert.rejects(state.save(initialItems), /SecureStore unavailable/);
});
