const test = require('node:test');
const assert = require('node:assert/strict');
const { createDemoNamespaceStore, DemoNamespaceStorageError } = require('./demo-namespace-storage.cjs');

function createMemoryStorage(initial = null) {
  const values = new Map(initial === null ? [] : [['nutrition-advisor.demo-namespace.v1', initial]]);
  return {
    values,
    async getItemAsync(key) { return values.get(key) ?? null; },
    async setItemAsync(key, value) { values.set(key, value); },
  };
}

test('creates and persists one valid namespace when storage is empty', async () => {
  const storage = createMemoryStorage();
  const store = createDemoNamespaceStore({ storage, createNamespace: () => 'demo-device-123' });

  assert.equal(await store.getNamespace(), 'demo-device-123');
  assert.equal(storage.values.get('nutrition-advisor.demo-namespace.v1'), 'demo-device-123');
});

test('reuses the persisted namespace within and across store instances', async () => {
  const storage = createMemoryStorage('demo-device-123');
  const createNamespace = () => assert.fail('stored namespace should be reused');

  assert.equal(await createDemoNamespaceStore({ storage, createNamespace }).getNamespace(), 'demo-device-123');
  assert.equal(await createDemoNamespaceStore({ storage, createNamespace }).getNamespace(), 'demo-device-123');
});

test('coalesces concurrent first reads so one namespace is persisted', async () => {
  const storage = createMemoryStorage();
  let generated = 0;
  const store = createDemoNamespaceStore({
    storage,
    createNamespace: () => `demo-device-${++generated}`,
  });

  assert.deepEqual(await Promise.all([store.getNamespace(), store.getNamespace()]), [
    'demo-device-1',
    'demo-device-1',
  ]);
  assert.equal(generated, 1);
});

test('reports storage read failures without generating a replacement namespace', async () => {
  let generated = false;
  const storage = {
    async getItemAsync() { throw new Error('keychain unavailable'); },
    async setItemAsync() { assert.fail('storage write should not run'); },
  };
  const store = createDemoNamespaceStore({ storage, createNamespace: () => { generated = true; return 'demo-device-123'; } });

  await assert.rejects(store.getNamespace(), error => {
    assert.ok(error instanceof DemoNamespaceStorageError);
    assert.equal(error.code, 'DEMO_NAMESPACE_READ_FAILED');
    return true;
  });
  assert.equal(generated, false);
});

test('reports storage write failures instead of returning an unsaved namespace', async () => {
  const storage = {
    async getItemAsync() { return null; },
    async setItemAsync() { throw new Error('keychain unavailable'); },
  };
  const store = createDemoNamespaceStore({ storage, createNamespace: () => 'demo-device-123' });

  await assert.rejects(store.getNamespace(), error => {
    assert.ok(error instanceof DemoNamespaceStorageError);
    assert.equal(error.code, 'DEMO_NAMESPACE_WRITE_FAILED');
    return true;
  });
});
