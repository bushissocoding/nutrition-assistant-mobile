const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const { createDemoStore } = require('../src/repositories/demo-store');
const { createSyntheticPlannerFixture } = require('./helpers/synthetic-planner-data');
const { normalizeMealEntryInput } = require('../src/services/meal-entries');
const { createMealEntryRepository, MealEntryRepositoryError } = require('../src/repositories/meal-entry-repository');

const { foods } = createSyntheticPlannerFixture();
const input = normalizeMealEntryInput({
  foodId: 'rice-steamed',
  portion: { amount: 100, unit: 'g' },
  mealType: 'LUNCH',
  consumedAt: '2026-11-16T12:00:00+07:00',
  timeZone: 'Asia/Ho_Chi_Minh',
  notes: 'synthetic note',
}, foods);

async function repositoryFixture(t) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'meal-entry-store-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, 'store.json');
  let id = 0;
  const options = {
    store: createDemoStore({ filePath }),
    idFactory: () => `entry-${++id}`,
    clock: () => new Date('2026-11-16T05:00:00.000Z'),
  };
  return { filePath, ...options, repository: createMealEntryRepository(options) };
}

test('creates entry and idempotency ledger atomically and replays the same intent', async t => {
  const { repository, store } = await repositoryFixture(t);
  const first = await repository.create('test-user-a', input, foods, 'create-key-1');
  const replay = await repository.create('test-user-a', input, foods, 'create-key-1');
  const rows = await store.readCollection('test-user-a', 'meal_entries');

  assert.equal(first.replayed, false);
  assert.equal(replay.replayed, true);
  assert.equal(first.item.id, replay.item.id);
  assert.equal(rows.filter(row => row.kind === 'entry').length, 1);
  assert.equal(rows.filter(row => row.kind === 'idempotency').length, 1);
  assert.equal(JSON.stringify(rows.find(row => row.kind === 'idempotency')).includes('synthetic note'), false);
});

test('rejects reusing an idempotency key with a different normalized payload', async t => {
  const { repository } = await repositoryFixture(t);
  await repository.create('test-user-a', input, foods, 'create-key-2');
  const changed = { ...input, portion: { amount: 200, unit: 'g' } };
  await assert.rejects(repository.create('test-user-a', changed, foods, 'create-key-2'), error => error.status === 409 && error.code === 'IDEMPOTENCY_CONFLICT');
});

test('serializes concurrent duplicate creates and returns one stored record', async t => {
  const { repository, store } = await repositoryFixture(t);
  const results = await Promise.all(Array.from({ length: 8 }, () => repository.create('test-user-a', input, foods, 'create-key-3')));
  const rows = await store.readCollection('test-user-a', 'meal_entries');

  assert.equal(new Set(results.map(result => result.item.id)).size, 1);
  assert.equal(results.filter(result => !result.replayed).length, 1);
  assert.equal(rows.filter(row => row.kind === 'entry').length, 1);
});

test('deletes entries but retains the key tombstone; purging removes entries and ledger', async t => {
  const { repository, store } = await repositoryFixture(t);
  const created = await repository.create('test-user-a', input, foods, 'create-key-4');
  await repository.delete('test-user-a', created.item.id);
  await assert.rejects(repository.create('test-user-a', input, foods, 'create-key-4'), error => error.status === 410 && error.code === 'IDEMPOTENT_RESULT_DELETED');
  assert.equal((await store.readCollection('test-user-a', 'meal_entries')).filter(row => row.kind === 'idempotency').length, 1);
  await repository.purge('test-user-a');
  assert.deepEqual(await store.readCollection('test-user-a', 'meal_entries'), []);
});

test('updates food/portion nutrients and isolates entries by namespace', async t => {
  const { repository } = await repositoryFixture(t);
  const created = await repository.create('test-user-a', input, foods, 'create-key-5');
  const updated = await repository.update('test-user-a', created.item.id, { portion: { amount: 200, unit: 'g' } }, foods);

  assert.equal(updated.nutrients.energyKcal, created.item.nutrients.energyKcal * 2);
  assert.equal(await repository.get('test-user-b', created.item.id), null);
  assert.equal(await repository.delete('test-user-b', created.item.id), false);
});

test('persists records after reopening the JSON repository', async t => {
  const { repository, filePath, idFactory, clock } = await repositoryFixture(t);
  const created = await repository.create('test-user-a', input, foods, 'create-key-6');
  const reopened = createMealEntryRepository({ store: createDemoStore({ filePath }), idFactory, clock });
  assert.deepEqual(await reopened.get('test-user-a', created.item.id), created.item);
});

test('returns a retryable repository error when the demo store fails', async () => {
  const repository = createMealEntryRepository({
    store: { updateCollection: async () => { throw new Error('disk unavailable'); }, readCollection: async () => [], writeCollection: async () => [] },
    idFactory: () => 'entry-failure',
    clock: () => new Date(),
  });
  await assert.rejects(repository.create('test-user-a', input, foods, 'create-key-7'), error => error instanceof MealEntryRepositoryError && error.status === 503);
});
