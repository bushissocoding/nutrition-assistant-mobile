const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createMealPlanRepository, validIdempotencyKey } = require('../src/repositories/meal-plan-repository');

function fakeDatabase() {
  const rows = [];
  let inserted = 0;
  return {
    rows,
    get inserted() { return inserted; },
    from(table) {
      assert.equal(table, 'meal_plans');
      const query = { filters: {}, insertedRow: null, descending: false, rangeValue: null };
      query.select = () => query;
      query.eq = (key, value) => { query.filters[key] = value; return query; };
      query.insert = row => { inserted += 1; query.insertedRow = row; return query; };
      query.single = async () => {
        if (rows.some(row => row.user_id === query.insertedRow.user_id && row.request_key === query.insertedRow.request_key)) return { data: null, error: { code: '23505' } };
        const row = { id: `plan-${rows.length + 1}`, created_at: '2026-11-24T00:00:00.000Z', ...query.insertedRow };
        rows.push(row);
        return { data: row, error: null };
      };
      query.maybeSingle = async () => ({ data: rows.find(row => Object.entries(query.filters).every(([key, value]) => row[key] === value)) || null, error: null });
      query.order = (_column, options) => { query.descending = options.ascending === false; return query; };
      query.range = async (start, end) => {
        const selected = rows.filter(row => Object.entries(query.filters).every(([key, value]) => row[key] === value));
        if (query.descending) selected.sort((a, b) => b.created_at.localeCompare(a.created_at));
        return { data: selected.slice(start, end + 1), count: selected.length, error: null };
      };
      return query;
    },
  };
}

test('account meal-plan create scopes owner and replays same normalized intent', async () => {
  const db = fakeDatabase();
  const repo = createMealPlanRepository();
  const input = { preferences: 'rice', contractVersion: 1 };
  const created = await repo.create({ db, userId: 'synthetic-user-a', requestKey: 'plan-intent-0001', input, plan: { status: 'feasible' }, profileUpdatedAt: '2026-11-24T00:00:00.000Z', catalogVersion: 'USDA-FDC-live-v1' });
  const replay = await repo.create({ db, userId: 'synthetic-user-a', requestKey: 'plan-intent-0001', input: { contractVersion: 1, preferences: 'rice' }, plan: { status: 'new' }, profileUpdatedAt: '2026-11-24T00:00:00.000Z', catalogVersion: 'USDA-FDC-live-v1' });
  assert.equal(created.record.id, replay.record.id);
  assert.equal(replay.record.plan.status, 'feasible');
  assert.equal(replay.replayed, true);
  const earlyReplay = await repo.replay({ db, userId: 'synthetic-user-a', requestKey: 'plan-intent-0001', input, profileUpdatedAt: '2026-11-24T00:00:00.000Z', catalogVersion: 'USDA-FDC-live-v1' });
  assert.equal(earlyReplay.record.id, created.record.id);
  assert.equal(earlyReplay.replayed, true);
  assert.equal(db.rows[0].user_id, 'synthetic-user-a');
  assert.equal(db.inserted, 1);
});

test('same account cannot reuse an idempotency key for changed profile intent', async () => {
  const db = fakeDatabase();
  const repo = createMealPlanRepository();
  const base = { db, userId: 'synthetic-user-a', requestKey: 'plan-intent-0001', input: { preferences: '' }, plan: {}, catalogVersion: 'USDA-FDC-live-v1' };
  await repo.create({ ...base, profileUpdatedAt: 'before' });
  await assert.rejects(repo.replay({ db, userId: base.userId, requestKey: base.requestKey, input: base.input, profileUpdatedAt: 'after', catalogVersion: base.catalogVersion }), error => error.code === 'IDEMPOTENCY_CONFLICT' && error.status === 409);
  await assert.rejects(repo.create({ ...base, profileUpdatedAt: 'after' }), error => error.code === 'IDEMPOTENCY_CONFLICT' && error.status === 409);
});

test('plan history is paginated and only returns the requested account rows', async () => {
  const db = fakeDatabase();
  const repo = createMealPlanRepository();
  for (const userId of ['synthetic-user-a', 'synthetic-user-b']) await repo.create({ db, userId, requestKey: `plan-intent-${userId}`, input: {}, plan: { owner: userId }, catalogVersion: 'USDA-FDC-live-v1' });
  const result = await repo.list({ db, userId: 'synthetic-user-a', limit: 1, offset: 0 });
  assert.equal(result.total, 1);
  assert.equal(result.items.length, 1);
  assert.deepEqual(result.items[0].plan, { owner: 'synthetic-user-a' });
});

test('idempotency keys and pagination reject unbounded or malformed input', async () => {
  assert.equal(validIdempotencyKey('plan-intent-0001'), true);
  assert.equal(validIdempotencyKey('bad key'), false);
  const repo = createMealPlanRepository();
  await assert.rejects(repo.create({ db: fakeDatabase(), userId: 'synthetic', requestKey: 'bad', input: {}, plan: {}, catalogVersion: 'x' }), error => error.code === 'INVALID_IDEMPOTENCY_KEY');
  await assert.rejects(repo.list({ db: fakeDatabase(), userId: 'synthetic', limit: 500, offset: 0 }), error => error.code === 'INVALID_PAGINATION');
});

test('meal plan migration enables account RLS and restricts rows to auth.uid()', () => {
  const migration = fs.readFileSync(path.join(__dirname, '../../supabase/migrations/202611240002_account_meal_plans.sql'), 'utf8');
  assert.match(migration, /alter table public\.meal_plans enable row level security/i);
  assert.match(migration, /meal_plans_user_request_key_unique unique \(user_id, request_key\)/i);
  assert.match(migration, /for select to authenticated using \(user_id = \(select auth\.uid\(\)\)\)/i);
  assert.match(migration, /for insert to authenticated with check \(user_id = \(select auth\.uid\(\)\)\)/i);
  assert.match(migration, /for delete to authenticated using \(user_id = \(select auth\.uid\(\)\)\)/i);
});
