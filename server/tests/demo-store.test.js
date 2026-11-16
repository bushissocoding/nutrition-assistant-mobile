const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createDemoStore } = require('../src/repositories/demo-store');

async function makeStore(t, fileName = 'demo-store.json') {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'nutrition-demo-store-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  return { directory, filePath: path.join(directory, fileName) };
}

test('missing store reads as empty and creates no file until the first write', async t => {
  const { filePath } = await makeStore(t);
  const store = createDemoStore({ filePath });

  assert.deepEqual(await store.readCollection('demo-client-1', 'diary'), []);
  await assert.rejects(fs.stat(filePath), { code: 'ENOENT' });
});

test('stores collections by namespace and reads them after reopening the repository', async t => {
  const { filePath } = await makeStore(t);
  const firstStore = createDemoStore({ filePath });
  const entry = { id: 'meal-1', foodId: 'rice-steamed', grams: 120 };

  await firstStore.writeCollection('demo-client-1', 'diary', [entry]);

  const reopenedStore = createDemoStore({ filePath });
  assert.deepEqual(await reopenedStore.readCollection('demo-client-1', 'diary'), [entry]);
  assert.deepEqual(await reopenedStore.readCollection('demo-client-2', 'diary'), []);
  assert.deepEqual(await reopenedStore.readCollection('demo-client-1', 'grocery'), []);
});

test('serializes concurrent updates without losing collection entries', async t => {
  const { filePath } = await makeStore(t);
  const store = createDemoStore({ filePath });

  await Promise.all(Array.from({ length: 20 }, (_, index) => store.updateCollection(
    'demo-client-1',
    'diary',
    async current => [...current, { id: `meal-${index}` }],
  )));

  const entries = await store.readCollection('demo-client-1', 'diary');
  assert.equal(entries.length, 20);
  assert.deepEqual(new Set(entries.map(entry => entry.id)), new Set(Array.from({ length: 20 }, (_, index) => `meal-${index}`)));
});

test('snapshots a collection before its queued write begins', async t => {
  const { filePath } = await makeStore(t);
  const store = createDemoStore({ filePath });
  const submitted = [{ id: 'original' }];

  const pendingWrite = store.writeCollection('demo-client-1', 'diary', submitted);
  submitted[0].id = 'mutated';
  await pendingWrite;

  assert.deepEqual(await store.readCollection('demo-client-1', 'diary'), [{ id: 'original' }]);
});

test('rejects malformed store JSON instead of treating it as empty', async t => {
  const { filePath } = await makeStore(t);
  await fs.writeFile(filePath, '{not-json', 'utf8');
  const store = createDemoStore({ filePath });

  await assert.rejects(store.readCollection('demo-client-1', 'diary'), /valid JSON/);
});

test('rejects unsafe namespaces, collection names, and non-array updates', async t => {
  const { filePath } = await makeStore(t);
  const store = createDemoStore({ filePath });

  await assert.rejects(store.readCollection('../other', 'diary'), /namespace/i);
  await assert.rejects(store.readCollection('demo-client-1', '../diary'), /collection/i);
  await assert.rejects(store.updateCollection('demo-client-1', 'diary', () => null), /array/i);
});

test('surfaces filesystem write errors', async t => {
  const { directory } = await makeStore(t);
  const parentFile = path.join(directory, 'file-blocking-directory-creation');
  await fs.writeFile(parentFile, 'not a directory', 'utf8');
  const store = createDemoStore({ filePath: path.join(parentFile, 'demo-store.json') });

  await assert.rejects(store.writeCollection('demo-client-1', 'diary', []));
});
