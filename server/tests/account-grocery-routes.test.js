const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createAccountGroceryRouter, createCustomPantryFoodId } = require('../src/routes/account-grocery');

const user = { id: '7f35a680-01cf-4db5-b92c-ea734130c17c' };
const savedPlanId = '82b4fefe-81fd-44f1-8be0-905e33f10b16';
const consent = (_req, _res, next) => next();

async function withServer(router, run) {
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.auth = { user }; req.userDatabase = { scoped: true }; next(); });
  app.use('/api/v1/me/grocery', router);
  const server = await new Promise(resolve => { const value = app.listen(0, '127.0.0.1', () => resolve(value)); });
  try { await run(`http://127.0.0.1:${server.address().port}/api/v1/me/grocery`); }
  finally { await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
}

test('grocery endpoints derive lists from owned saved plans and pass only the request key', async () => {
  const calls = [];
  const list = { id: 'list-1', items: [] };
  const repository = {
    async getCurrent(input) { calls.push(['get', input]); return list; },
    async createFromPlan(input) { calls.push(['create', input]); return { list, replayed: false }; },
  };
  await withServer(createAccountGroceryRouter({ repository, foodSource: { getFood() {} }, requireCurrentConsent: consent }), async base => {
    const get = await fetch(`${base}/shopping-list`);
    assert.deepEqual(await get.json(), { list });
    const invalid = await fetch(`${base}/shopping-list`, { method: 'POST', headers: { 'content-type': 'application/json', 'Idempotency-Key': 'grocery-intent-1' }, body: JSON.stringify({ savedPlanId, items: [{ foodId: 'fdc:1' }] }) });
    assert.equal(invalid.status, 400);
    assert.equal(calls.some(([name]) => name === 'create'), false);
    const created = await fetch(`${base}/shopping-list`, { method: 'POST', headers: { 'content-type': 'application/json', 'Idempotency-Key': 'grocery-intent-1' }, body: JSON.stringify({ savedPlanId }) });
    assert.equal(created.status, 201);
    assert.deepEqual(await created.json(), { list, replayed: false });
  });
  assert.deepEqual(calls[0], ['get', { db: { scoped: true }, userId: user.id }]);
  assert.deepEqual(calls[1], ['create', { db: { scoped: true }, userId: user.id, savedPlanId, requestKey: 'grocery-intent-1' }]);
});

test('pantry writes use a verified USDA detail record instead of client supplied names or sources', async () => {
  let createCall;
  let shoppingCall;
  let providerCalls = 0;
  const food = { id: 'fdc:12345', name: 'Oats', source: { id: 'USDA-FDC', recordId: '12345', edition: '2025-04-01' }, catalogVersion: 'USDA-FDC-live-v1' };
  const repository = {
    async createPantryItem(input) { createCall = input; return { replayed: false, item: { id: 'pantry-1', foodId: input.item.foodId, name: input.item.name, amount: input.item.amount, unit: input.item.unit, source: input.item.source, catalogVersion: input.item.catalogVersion } }; },
    async addShoppingItem(input) { shoppingCall = input; return { id: 'item-1', foodId: input.item.foodId, name: input.item.name, amount: input.item.amount, unit: input.item.unit, purchased: false, source: input.item.source, catalogVersion: input.item.catalogVersion }; },
  };
  await withServer(createAccountGroceryRouter({ repository, foodSource: { async getFood(id) { providerCalls += 1; assert.equal(id, '12345'); return food; } }, requireCurrentConsent: consent }), async base => {
    const invalid = await fetch(`${base}/pantry`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ foodId: food.id, name: 'Fake', amount: 100, unit: 'g', source: { id: 'fake' } }) });
    assert.equal(invalid.status, 400);
    assert.equal(providerCalls, 0);
    const saved = await fetch(`${base}/pantry`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ foodId: food.id, amount: 100, unit: 'g' }) });
    assert.equal(saved.status, 201);
    assert.equal((await saved.json()).item.name, 'Oats');
    const shopping = await fetch(`${base}/shopping-list/items`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ foodId: food.id, amount: 250, unit: 'g' }) });
    assert.equal(shopping.status, 201);
    assert.equal((await shopping.json()).item.name, 'Oats');
  });
  assert.equal(providerCalls, 2);
  assert.equal(createCall.userId, user.id);
  assert.deepEqual(createCall.item.source, { id: 'USDA-FDC', recordId: '12345', edition: '2025-04-01' });
  assert.equal(createCall.item.catalogVersion, 'USDA-FDC-live-v1');
  assert.equal(shoppingCall.userId, user.id);
  assert.equal(shoppingCall.item.amount, 250);
  assert.deepEqual(shoppingCall.item.source, createCall.item.source);
});

test('custom pantry names are safely labeled unverified and receive stable identifiers', async () => {
  let createCall;
  let providerCalls = 0;
  const repository = { async createPantryItem(input) { createCall = input; return { item: { id: 'pantry-custom', ...input.item }, replayed: false }; } };
  await withServer(createAccountGroceryRouter({ repository, foodSource: { async getFood() { providerCalls += 1; } }, requireCurrentConsent: consent }), async base => {
    const created = await fetch(`${base}/pantry`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ customName: '  Rau   muống ', amount: 2, unit: 'bunch' }) });
    assert.equal(created.status, 201);
    const result = await created.json();
    assert.equal(result.item.name, 'Rau muống');
    assert.equal(result.item.source.id, 'USER-ENTERED');
    assert.equal(result.item.catalogVersion, 'user-entered-v1');
  });
  assert.equal(providerCalls, 0);
  assert.match(createCall.item.foodId, /^custom:[a-f0-9]{64}$/);
  assert.equal(createCall.item.foodId, createCustomPantryFoodId('Rau muống'));
  assert.equal(createCustomPantryFoodId('Rau   muống'), createCustomPantryFoodId(' rau muống '));
});

test('shopping mutations constrain owner and parent identifiers and allow only supported patch fields', async () => {
  const calls = [];
  const repository = {
    async updateShoppingItem(input) { calls.push(input); return { id: input.itemId, name: 'Oats', amount: input.patch.amount || 100, unit: input.patch.unit || 'g', purchased: input.patch.purchased ?? false }; },
    async deletePantryItem(input) { calls.push(input); return true; },
  };
  await withServer(createAccountGroceryRouter({ repository, foodSource: { getFood() {} }, requireCurrentConsent: consent }), async base => {
    const bad = await fetch(`${base}/shopping-list/items/not-a-uuid`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: 'Other' }) });
    assert.equal(bad.status, 404);
    const updated = await fetch(`${base}/shopping-list/items/82b4fefe-81fd-44f1-8be0-905e33f10b16`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ purchased: true }) });
    assert.equal(updated.status, 200);
    assert.deepEqual(calls[0], { db: { scoped: true }, userId: user.id, itemId: '82b4fefe-81fd-44f1-8be0-905e33f10b16', patch: { purchased: true } });
    const removed = await fetch(`${base}/pantry/82b4fefe-81fd-44f1-8be0-905e33f10b16`, { method: 'DELETE' });
    assert.equal(removed.status, 204);
  });
  assert.deepEqual(calls[1], { db: { scoped: true }, userId: user.id, itemId: '82b4fefe-81fd-44f1-8be0-905e33f10b16' });
});

test('pantry pages are bounded, report total rows and preserve account filters for detail reads', async () => {
  const calls = [];
  const item = { id: '82b4fefe-81fd-44f1-8be0-905e33f10b16', foodId: 'fdc:12345', name: 'Oats', amount: 100, unit: 'g' };
  const repository = {
    async listPantry(input) { calls.push(['list', input]); return { items: [item], total: 101, limit: input.limit, offset: input.offset }; },
    async getPantryItem(input) { calls.push(['get', input]); return item; },
    async getPantryItemByFoodId(input) { calls.push(['food', input]); return item; },
  };
  await withServer(createAccountGroceryRouter({ repository, foodSource: { getFood() {} }, requireCurrentConsent: consent }), async base => {
    const page = await fetch(`${base}/pantry?limit=100&offset=100`);
    assert.deepEqual(await page.json(), { items: [item], pagination: { limit: 100, offset: 100, total: 101, hasMore: false } });
    const invalid = await fetch(`${base}/pantry?limit=1001`);
    assert.equal(invalid.status, 400);
    assert.equal((await (await fetch(`${base}/pantry/${item.id}`)).json()).item.id, item.id);
    assert.equal((await (await fetch(`${base}/pantry/food/fdc%3A12345`)).json()).item.id, item.id);
  });
  assert.deepEqual(calls, [
    ['list', { db: { scoped: true }, userId: user.id, limit: 100, offset: 100 }],
    ['get', { db: { scoped: true }, userId: user.id, itemId: item.id }],
    ['food', { db: { scoped: true }, userId: user.id, foodId: 'fdc:12345' }],
  ]);
});
