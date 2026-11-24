const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createMealPlanRouter } = require('../src/routes/meal-plans');

const profile = { id: 'synthetic-user-a', username: 'patient_a', mode: 'healthy', allergies: [], red_flags: [], hard_limits: {}, updated_at: '2026-11-24T00:00:00.000Z' };
const food = { id: 'rice-steamed', name: 'Cơm', category: 'Grain', tags: [], preparation: { description: 'Mục đối chiếu: rice, white, long-grain, regular, cooked.' } };
const template = { id: 'meal-1', version: 'template-1', name: 'Bữa sáng', slot: 'Bữa sáng', provenance: { sourceId: 'recipe-source', sourceRecordId: 'meal-1', edition: 'sample-v1', method: 'Project sample.' }, price: { unit: 'VND', status: 'missing' }, items: [{ foodId: food.id, grams: 100 }] };
const catalog = { sources: [{ id: 'recipe-source', kind: 'internal', name: 'Recipes', url: null }], nutrientUnits: {} };
const nutrients = { energyKcal: { value: 220, unit: 'kcal' }, proteinG: { value: 4, unit: 'g' }, carbohydrateG: { value: 45, unit: 'g' }, fatG: { value: 1, unit: 'g' }, fiberG: { value: 1, unit: 'g' }, sodiumMg: { value: 2, unit: 'mg' } };

async function withServer(router, run) {
  const app = express(); app.use(express.json()); app.use('/api/v1/me/meal-plans', router);
  const server = await new Promise(resolve => { const value = app.listen(0, '127.0.0.1', () => resolve(value)); });
  try { await run(`http://127.0.0.1:${server.address().port}/api/v1/me/meal-plans`); }
  finally { await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
}

function requestContext() {
  const db = { from(table) {
    assert.equal(table, 'profiles');
    return { select: () => ({ eq: (_key, owner) => ({ maybeSingle: async () => ({ data: owner === profile.id ? profile : null, error: null }) }) }) };
  } };
  const foodSource = {
    async search(query) { return { items: [{ id: 'fdc:12345', fdcId: '12345', name: query }] }; },
    async getFood() { return { id: 'fdc:12345', fdcId: '12345', name: 'Rice, white, long-grain, regular, cooked', catalogVersion: 'USDA-FDC-live-v1', source: { id: 'USDA-FDC', recordId: '12345', edition: '2025-01-01' }, nutrition: { values: nutrients } }; },
  };
  return { db, foodSource };
}

function testConsent(db) {
  return (req, _res, next) => { req.auth = { user: { id: profile.id } }; req.userDatabase = db; next(); };
}

test('meal-plan route stores only feasible account-owned sourced snapshots with server profile constraints', async () => {
  const { db, foodSource } = requestContext();
  let stored;
  const repository = {
    async replay() { return null; },
    async create(input) { stored = input; return { replayed: false, record: { id: 'saved-plan-1', plan: input.plan, createdAt: '2026-11-24T00:00:00.000Z', catalogVersion: input.catalogVersion, profileUpdatedAt: input.profileUpdatedAt } }; },
  };
  const router = createMealPlanRouter({ foods: [food], mealTemplates: [template], catalog, foodSource, repository, requireCurrentConsent: testConsent(db) });
  await withServer(router, async base => {
    const response = await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'plan-intent-001' }, body: JSON.stringify({ contractVersion: 1, preferences: 'rice' }) });
    assert.equal(response.status, 201);
    const body = await response.json();
    assert.equal(body.status, 'feasible');
    assert.equal(body.savedPlan.id, 'saved-plan-1');
    assert.equal(stored.userId, profile.id);
    assert.deepEqual(stored.input, { contractVersion: 1, preferences: 'rice' });
    assert.equal(stored.plan.plan[0].portions[0].foodId, 'fdc:12345');
  });
});

test('meal-plan API rejects client-provided allergies or hard limits and requires idempotency', async () => {
  const { db, foodSource } = requestContext();
  let createCalls = 0;
  const repository = { async replay() { return null; }, async create() { createCalls += 1; } };
  const router = createMealPlanRouter({ foods: [food], mealTemplates: [template], catalog, foodSource, repository, requireCurrentConsent: testConsent(db) });
  await withServer(router, async base => {
    const tampered = await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'plan-intent-001' }, body: JSON.stringify({ contractVersion: 1, allergies: [], hardLimits: {} }) });
    assert.equal(tampered.status, 400);
    assert.equal((await tampered.json()).code, 'INVALID_MEAL_PLAN_REQUEST');
    const missingKey = await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contractVersion: 1 }) });
    assert.equal(missingKey.status, 400);
    assert.equal((await missingKey.json()).code, 'INVALID_IDEMPOTENCY_KEY');
  });
  assert.equal(createCalls, 0);
});

test('saved plan retries replay before contacting the food provider', async () => {
  const { db } = requestContext();
  let providerCalls = 0;
  const saved = { id: 'saved-plan-1', plan: { status: 'feasible', planFeasible: true, plan: [] }, createdAt: '2026-11-24T00:00:00.000Z', catalogVersion: 'USDA-FDC-live-v1', profileUpdatedAt: profile.updated_at };
  const repository = {
    async replay(input) { assert.equal(input.userId, profile.id); return { record: saved, replayed: true }; },
    async create() { assert.fail('a replay must not insert again'); },
  };
  const router = createMealPlanRouter({ foods: [food], mealTemplates: [template], catalog, foodSource: { async search() { providerCalls += 1; throw new Error('offline'); } }, repository, requireCurrentConsent: testConsent(db) });
  await withServer(router, async base => {
    const response = await fetch(base, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'plan-intent-001' }, body: JSON.stringify({ contractVersion: 1, preferences: 'rice' }) });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).savedPlan.id, 'saved-plan-1');
  });
  assert.equal(providerCalls, 0);
});

test('meal-plan history delegates bounded pagination to owner-scoped repository', async () => {
  let listed;
  const { db } = requestContext();
  const router = createMealPlanRouter({ repository: { async list(value) { listed = value; return { items: [], ...value, total: 0 }; } }, requireCurrentConsent: testConsent(db) });
  await withServer(router, async base => {
    const response = await fetch(`${base}?limit=10&offset=20`);
    assert.equal(response.status, 200);
    assert.equal(listed.userId, profile.id);
    assert.deepEqual({ limit: listed.limit, offset: listed.offset }, { limit: 10, offset: 20 });
    assert.equal((await fetch(`${base}?limit=100`)).status, 400);
  });
});
