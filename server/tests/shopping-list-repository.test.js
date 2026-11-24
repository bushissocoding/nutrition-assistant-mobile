const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createDemoStore } = require('../src/repositories/demo-store');
const { loadCatalog } = require('../src/repositories/catalog');
const { normalizeShoppingListInput } = require('../src/services/shopping-lists');
const { createShoppingListRepository, ShoppingListRepositoryError } = require('../src/repositories/shopping-list-repository');

const { foods } = loadCatalog();
const items = normalizeShoppingListInput({ items: [{ foodId: 'rice-steamed', amount: 300, unit: 'g' }] }, foods);

async function repositoryFixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'shopping-list-store-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, 'store.json');
  let id = 0;
  const options = {
    store: createDemoStore({ filePath }),
    idFactory: () => `generated-${++id}`,
    itemIdFactory: () => `item-${id}`,
    clock: () => new Date('2026-11-16T05:16:00.000Z'),
  };
  return { filePath, ...options, repository: createShoppingListRepository(options) };
}

test('creates current list and idempotency ledger atomically; replay returns one list', async t => {
  const { repository, store } = await repositoryFixture(t);
  const first = await repository.create('demo-a', items, foods, 'create-list-0001');
  const replay = await repository.create('demo-a', items, foods, 'create-list-0001');
  const rows = await store.readCollection('demo-a', 'shopping_lists');
  const ledger = rows.find(row => row.kind === 'idempotency');

  assert.equal(first.replayed, false);
  assert.equal(replay.replayed, true);
  assert.equal(first.list.id, replay.list.id);
  assert.equal(rows.filter(row => row.kind === 'current').length, 1);
  assert.equal(rows.filter(row => row.kind === 'idempotency').length, 1);
  assert.equal(JSON.stringify(ledger).includes('rice-steamed'), false);
});

test('rejects changed body for a key and returns a tombstone after replacement', async t => {
  const { repository } = await repositoryFixture(t);
  await repository.create('demo-a', items, foods, 'create-list-0002');
  const changed = [{ ...items[0], amount: 500 }];
  await assert.rejects(repository.create('demo-a', changed, foods, 'create-list-0002'), error => error.status === 409 && error.code === 'IDEMPOTENCY_CONFLICT');

  await repository.create('demo-a', changed, foods, 'create-list-0003');
  await assert.rejects(repository.create('demo-a', items, foods, 'create-list-0002'), error => error.status === 410 && error.code === 'IDEMPOTENT_RESULT_DELETED');
});

test('serializes concurrent duplicate creates without duplicate lists', async t => {
  const { repository, store } = await repositoryFixture(t);
  const results = await Promise.all(Array.from({ length: 8 }, () => repository.create('demo-a', items, foods, 'create-list-0004')));
  const rows = await store.readCollection('demo-a', 'shopping_lists');
  assert.equal(new Set(results.map(result => result.list.id)).size, 1);
  assert.equal(results.filter(result => !result.replayed).length, 1);
  assert.equal(rows.filter(row => row.kind === 'current').length, 1);
});

test('updates and deletes items, keeps an empty list, then tombstones list deletion', async t => {
  const { repository, store } = await repositoryFixture(t);
  const created = await repository.create('demo-a', items, foods, 'create-list-0005');
  const item = created.list.items[0];
  const updated = await repository.updateItem('demo-a', item.id, { amount: 450, unit: 'g', purchased: true });
  assert.deepEqual({ amount: updated.amount, unit: updated.unit, purchased: updated.purchased }, { amount: 450, unit: 'g', purchased: true });
  assert.equal((await repository.getCurrent('demo-a')).items[0].purchased, true);
  assert.equal(await repository.deleteItem('demo-a', item.id), true);
  assert.deepEqual((await repository.getCurrent('demo-a')).items, []);
  assert.equal(await repository.deleteItem('demo-a', item.id), false);

  assert.equal(await repository.deleteCurrent('demo-a'), true);
  assert.equal(await repository.getCurrent('demo-a'), null);
  await assert.rejects(repository.create('demo-a', items, foods, 'create-list-0005'), error => error.status === 410);
  const rowsBeforePurge = await store.readCollection('demo-a', 'shopping_lists');
  assert.equal(rowsBeforePurge.filter(row => row.kind === 'idempotency').length, 1);
  await repository.purge('demo-a');
  assert.deepEqual(await store.readCollection('demo-a', 'shopping_lists'), []);
  assert.equal(await repository.deleteCurrent('demo-a'), false);
});

test('isolates namespaces and persists after the demo store is reopened', async t => {
  const { repository, filePath, store, idFactory, itemIdFactory, clock } = await repositoryFixture(t);
  const created = await repository.create('demo-a', items, foods, 'create-list-0006');
  assert.equal(await repository.getCurrent('demo-b'), null);
  assert.equal(await repository.updateItem('demo-b', created.list.items[0].id, { purchased: true }), null);
  assert.equal(await repository.deleteItem('demo-b', created.list.items[0].id), false);

  const reopened = createShoppingListRepository({ store: createDemoStore({ filePath }), idFactory, itemIdFactory, clock });
  assert.deepEqual(await reopened.getCurrent('demo-a'), created.list);
  assert.deepEqual(await reopened.getCurrent('demo-b'), null);
  assert.deepEqual(await store.readCollection('demo-a', 'shopping_lists'), await createDemoStore({ filePath }).readCollection('demo-a', 'shopping_lists'));
});

test('validates idempotency keys and maps store failures to finite retryable errors', async () => {
  const repository = createShoppingListRepository({
    store: { updateCollection: async () => { throw new Error('disk unavailable'); }, readCollection: async () => { throw new Error('disk unavailable'); } },
    idFactory: () => 'list-failure',
    clock: () => new Date(),
  });
  await assert.rejects(repository.create('demo-a', items, foods, 'short'), error => error.status === 400 && error.code === 'VALIDATION_ERROR');
  await assert.rejects(repository.create('demo-a', items, foods, 'create-list-0007'), error => error instanceof ShoppingListRepositoryError && error.status === 503 && !error.message.includes('disk unavailable'));
  await assert.rejects(repository.getCurrent('demo-a'), error => error.status === 503);
});
