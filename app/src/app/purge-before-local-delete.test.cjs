const test = require('node:test');
const assert = require('node:assert/strict');
const { purgeBeforeLocalDelete } = require('./purge-before-local-delete.cjs');

test('purges remote diary before clearing local profile or consent', async () => {
  const order = [];
  await purgeBeforeLocalDelete(
    async () => { order.push('remote-purge-confirmed'); },
    async () => { order.push('local-clear'); },
  );
  assert.deepEqual(order, ['remote-purge-confirmed', 'local-clear']);
});

test('keeps local profile and consent when remote diary purge fails', async () => {
  let localClearCalled = false;
  await assert.rejects(purgeBeforeLocalDelete(
    async () => { throw new Error('offline'); },
    async () => { localClearCalled = true; },
  ), /offline/);
  assert.equal(localClearCalled, false);
});
