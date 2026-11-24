const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { createAccountGroceryRepository } = require('../src/repositories/account-grocery-repository');

function fixtureDb() {
  const rows = {
    shopping_lists: [{ id: 'list-a', user_id: 'user-a', source_plan_id: 'plan-a', request_key: 'grocery-intent-a1', is_current: true, created_at: '2026-11-24T00:00:00.000Z', updated_at: '2026-11-24T00:00:00.000Z' }],
    shopping_list_items: [{ id: 'item-a', list_id: 'list-a', food_id: 'fdc:12345', name: 'Rice', amount: 300, unit: 'g', purchased: false, source: { id: 'USDA-FDC', recordId: '12345', edition: '2025-04-01' }, catalog_version: 'USDA-FDC-live-v1', created_at: '2026-11-24T00:00:00.000Z', updated_at: '2026-11-24T00:00:00.000Z' }],
    pantry_items: [{ id: 'pantry-a', user_id: 'user-a', food_id: 'fdc:12345', name: 'Rice', amount: 200, unit: 'g', source: { id: 'USDA-FDC', recordId: '12345' }, catalog_version: 'USDA-FDC-live-v1', created_at: '2026-11-24T00:00:00.000Z', updated_at: '2026-11-24T00:00:00.000Z' }],
  };
  const calls = [];
  let rpcValue = 'list-a';
  const db = {
    rows,
    calls,
    setRpcValue(value) { rpcValue = value; },
    async rpc(name, args) { calls.push({ type: 'rpc', name, args }); return { data: rpcValue, error: null }; },
    from(table) {
      const tableRows = rows[table];
      assert.ok(tableRows, `unexpected table ${table}`);
      const query = { filters: [], operation: 'select', payload: null, page: null };
      query.select = () => query;
      query.eq = (key, value) => { query.filters.push(row => row[key] === value); return query; };
      query.order = () => query;
      query.range = (from, to) => { query.page = [from, to]; return query; };
      query.insert = payload => { query.operation = 'insert'; query.payload = payload; return query; };
      query.update = payload => { query.operation = 'update'; query.payload = payload; return query; };
      query.delete = () => { query.operation = 'delete'; return query; };
      query.order = () => query;
      query.matches = row => query.filters.every(filter => filter(row));
      query.maybeSingle = async () => {
        calls.push({ type: query.operation, table, filters: query.filters.length });
        const index = tableRows.findIndex(query.matches);
        if (index < 0) return { data: null, error: null };
        if (query.operation === 'update') tableRows[index] = { ...tableRows[index], ...query.payload };
        if (query.operation === 'delete') return { data: tableRows.splice(index, 1)[0], error: null };
        return { data: tableRows[index], error: null };
      };
      query.single = async () => {
        calls.push({ type: query.operation, table, payload: query.payload });
        const row = { id: `${table}-new`, created_at: '2026-11-24T00:00:00.000Z', updated_at: '2026-11-24T00:00:00.000Z', ...query.payload };
        tableRows.push(row);
        return { data: row, error: null };
      };
      query.then = (resolve, reject) => {
        const matchingRows = tableRows.filter(query.matches);
        const data = query.page ? matchingRows.slice(query.page[0], query.page[1] + 1) : matchingRows;
        return Promise.resolve({ data, count: matchingRows.length, error: null }).then(resolve, reject);
      };
      return query;
    },
  };
  return db;
}

test('shopping lists derive creation from a plan ID RPC and replay the owner snapshot', async () => {
  const db = fixtureDb();
  const repo = createAccountGroceryRepository();
  const created = await repo.createFromPlan({ db, userId: 'user-a', savedPlanId: 'plan-new', requestKey: 'grocery-intent-new1' });
  assert.equal(created.list.id, 'list-a');
  assert.equal(created.list.items[0].source.recordId, '12345');
  assert.ok(db.calls.some(call => call.type === 'rpc' && call.name === 'replace_shopping_list_from_plan'
    && call.args.p_saved_plan_id === 'plan-new' && call.args.p_request_key === 'grocery-intent-new1'));

  const replay = await repo.createFromPlan({ db, userId: 'user-a', savedPlanId: 'plan-a', requestKey: 'grocery-intent-a1' });
  assert.equal(replay.replayed, true);
  assert.equal(replay.list.items[0].id, 'item-a');
  await assert.rejects(repo.createFromPlan({ db, userId: 'user-a', savedPlanId: 'plan-other', requestKey: 'grocery-intent-a1' }), error => error.status === 409 && error.code === 'IDEMPOTENCY_CONFLICT');
});

test('current list and pantry repository operations scope owner and parent list IDs', async () => {
  const db = fixtureDb();
  const repo = createAccountGroceryRepository();
  assert.equal((await repo.getCurrent({ db, userId: 'user-b' })), null);
  const result = await repo.getCurrent({ db, userId: 'user-a' });
  assert.equal(result.items[0].id, 'item-a');
  const changed = await repo.updateShoppingItem({ db, userId: 'user-a', itemId: 'item-a', patch: { purchased: true } });
  assert.equal(changed.purchased, true);
  assert.equal(await repo.deleteShoppingItem({ db, userId: 'user-b', itemId: 'item-a' }), false);
  const pantry = await repo.listPantry({ db, userId: 'user-a' });
  assert.equal(pantry.items[0].source.recordId, '12345');
  assert.deepEqual({ total: pantry.total, limit: pantry.limit, offset: pantry.offset }, { total: 1, limit: 100, offset: 0 });
  assert.equal((await repo.updatePantryItem({ db, userId: 'user-b', itemId: 'pantry-a', patch: { amount: 500, unit: 'g' } })), null);
  assert.equal(await repo.deletePantryItem({ db, userId: 'user-b', itemId: 'pantry-a' }), false);
  assert.ok(db.calls.some(call => call.type === 'update' && call.table === 'shopping_list_items' && call.filters === 2));
});

test('grocery migration gives all persisted rows account ownership and transactional plan-derived list replacement', () => {
  const migration = fs.readFileSync(path.join(__dirname, '../../supabase/migrations/202611240004_account_grocery.sql'), 'utf8');
  assert.match(migration, /shopping_lists_one_current_per_owner/i);
  assert.match(migration, /references auth\.users \(id\) on delete cascade/i);
  assert.match(migration, /for select to authenticated using \(user_id = \(select auth\.uid\(\)\)\)/i);
  assert.match(migration, /create or replace function public\.replace_shopping_list_from_plan/i);
  assert.match(migration, /saved\.id = p_saved_plan_id and saved\.user_id = v_owner/i);
  assert.match(migration, /security definer\s+set search_path = ''/i);
  assert.match(migration, /create or replace function public\.clear_current_shopping_list/i);
  assert.match(migration, /shopping_list_items_enforce_cap/i);
  assert.match(migration, /v_item_count >= 100/i);
  assert.match(migration, /shopping_list_items[\s\S]*?for select to authenticated using \(exists/i);
});
