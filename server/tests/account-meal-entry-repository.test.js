const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createAccountMealEntryRepository } = require('../src/repositories/account-meal-entry-repository');

function fakeDatabase() {
  const rows = [];
  return {
    rows,
    from(table) {
      assert.equal(table, 'meal_entries');
      const query = { filters: [], inserted: null, updated: null, minimum: null, maximum: null, nullFilters: [], orderColumn: null };
      query.select = () => query;
      query.eq = (key, value) => { query.filters.push(row => row[key] === value); return query; };
      query.is = (key, value) => { query.nullFilters.push(row => row[key] === value); return query; };
      query.gte = (key, value) => { query.minimum = row => row[key] >= value; return query; };
      query.lt = (key, value) => { query.maximum = row => row[key] < value; return query; };
      query.insert = value => { query.inserted = value; return query; };
      query.update = value => { query.updated = value; return query; };
      query.order = key => { query.orderColumn = key; return query; };
      query.range = async (start, end) => {
        const matching = rows.filter(row => query.filters.every(filter => filter(row))
          && query.nullFilters.every(filter => filter(row)) && (!query.minimum || query.minimum(row)) && (!query.maximum || query.maximum(row)));
        return { data: matching.slice(start, end + 1), count: matching.length, error: null };
      };
      query.maybeSingle = async () => {
        const index = rows.findIndex(row => query.filters.every(filter => filter(row)) && query.nullFilters.every(filter => filter(row)));
        if (index < 0) return { data: null, error: null };
        if (query.updated) rows[index] = { ...rows[index], ...query.updated, updated_at: '2026-11-24T12:00:00.000Z' };
        return { data: rows[index], error: null };
      };
      query.single = async () => {
        if (rows.some(row => row.user_id === query.inserted.user_id && row.request_key === query.inserted.request_key)) return { data: null, error: { code: '23505' } };
        const row = { id: `entry-${rows.length + 1}`, created_at: '2026-11-24T00:00:00.000Z', updated_at: '2026-11-24T00:00:00.000Z', deleted_at: null, ...query.inserted };
        rows.push(row);
        return { data: row, error: null };
      };
      return query;
    },
  };
}

function fixture() {
  return {
    id: 'entry-1',
    foodId: 'fdc:12345', foodName: 'Beans, cooked', portion: { amount: 100, unit: 'g' },
    mealType: 'LUNCH', consumedAt: '2026-11-24T05:15:00.000Z', timeZone: 'Asia/Saigon', notes: null,
    nutrients: { energyKcal: 127, proteinG: 8.7, carbohydrateG: 22.8, fatG: 0.5, fiberG: null, sodiumMg: 2 },
    source: { id: 'USDA-FDC', recordId: '12345', edition: '2025-04-01' },
    catalogVersion: 'USDA-FDC-live-v1', foodSnapshot: { id: 'fdc:12345', name: 'Beans, cooked' },
  };
}

test('account diary create writes verified owner and saved source snapshot; retry replays stored row', async () => {
  const db = fakeDatabase();
  const repo = createAccountMealEntryRepository();
  const input = { foodId: 'fdc:12345', portion: { amount: 100, unit: 'g' }, consumedAt: '2026-11-24T05:15:00.000Z' };
  const created = await repo.create({ db, userId: 'synthetic-user-a', requestKey: 'diary-intent-001', input, item: fixture() });
  const replay = await repo.replay({ db, userId: 'synthetic-user-a', requestKey: 'diary-intent-001', input });
  assert.equal(db.rows[0].user_id, 'synthetic-user-a');
  assert.equal(created.item.source.recordId, '12345');
  assert.equal(replay.item.id, created.item.id);
  assert.equal(replay.replayed, true);
  assert.equal(db.rows.length, 1);
});

test('account diary idempotency rejects changed intent and reports deleted tombstone', async () => {
  const db = fakeDatabase();
  const repo = createAccountMealEntryRepository();
  const input = { foodId: 'fdc:12345', portion: { amount: 100, unit: 'g' } };
  await repo.create({ db, userId: 'synthetic-user-a', requestKey: 'diary-intent-001', input, item: fixture() });
  await assert.rejects(repo.replay({ db, userId: 'synthetic-user-a', requestKey: 'diary-intent-001', input: { ...input, portion: { amount: 200, unit: 'g' } } }), error => error.code === 'IDEMPOTENCY_CONFLICT' && error.status === 409);
  await repo.delete({ db, userId: 'synthetic-user-a', id: 'entry-1' });
  await assert.rejects(repo.replay({ db, userId: 'synthetic-user-a', requestKey: 'diary-intent-001', input }), error => error.code === 'IDEMPOTENT_RESULT_DELETED' && error.status === 410);
});

test('account diary listing and mutation queries explicitly scope user and live rows', async () => {
  const db = fakeDatabase();
  const repo = createAccountMealEntryRepository();
  await repo.create({ db, userId: 'synthetic-user-a', requestKey: 'diary-intent-a01', input: { a: 1 }, item: fixture() });
  await repo.create({ db, userId: 'synthetic-user-b', requestKey: 'diary-intent-b01', input: { a: 1 }, item: { ...fixture(), id: 'entry-2' } });
  const result = await repo.listByRange({ db, userId: 'synthetic-user-a', start: new Date('2026-11-24T00:00:00Z'), end: new Date('2026-11-25T00:00:00Z'), limit: 10, offset: 0 });
  assert.equal(result.total, 1);
  assert.equal(result.items[0].foodId, 'fdc:12345');
  await repo.update({ db, userId: 'synthetic-user-a', id: 'entry-1', item: { ...fixture(), notes: 'updated' } });
  assert.equal((await repo.get({ db, userId: 'synthetic-user-b', id: 'entry-1' })), null);
  assert.equal(await repo.delete({ db, userId: 'synthetic-user-b', id: 'entry-1' }), false);
});

test('account meal diary migration scopes reads/writes and retains retry keys with soft deletion', () => {
  const migration = fs.readFileSync(path.join(__dirname, '../../supabase/migrations/202611240003_account_meal_diary.sql'), 'utf8');
  assert.match(migration, /meal_entries_owner_request_key_unique unique \(user_id, request_key\)/i);
  assert.match(migration, /references auth\.users \(id\) on delete cascade/i);
  assert.match(migration, /alter table public\.meal_entries enable row level security/i);
  assert.match(migration, /for select to authenticated using \(user_id = \(select auth\.uid\(\)\)\)/i);
  assert.match(migration, /for insert to authenticated with check \(user_id = \(select auth\.uid\(\)\)\)/i);
  assert.match(migration, /for update to authenticated using \(user_id = \(select auth\.uid\(\)\)\) with check \(user_id = \(select auth\.uid\(\)\)\)/i);
  assert.match(migration, /deleted_at timestamptz/i);
});
