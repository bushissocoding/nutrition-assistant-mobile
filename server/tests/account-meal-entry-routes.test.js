const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createAccountMealEntryRouter } = require('../src/routes/account-meal-entries');
const { createNutritionReportRouter } = require('../src/routes/nutrition-report');

const ownerId = 'synthetic-user-a';
const food = {
  id: 'synthetic-test-source:12345', recordId: '12345', name: 'Beans, cooked', catalogVersion: 'synthetic-test-v1',
  nutrition: { values: {
    energyKcal: { value: 127 }, proteinG: { value: 8.7 }, carbohydrateG: { value: 22.8 },
    fatG: { value: 0.5 }, fiberG: { value: null }, sodiumMg: { value: 2 },
  } },
  source: { id: 'synthetic-test-source', label: 'Nguồn thử nghiệm', recordId: '12345', edition: '2025-04-01' },
};
const input = {
  foodId: food.id, portion: { amount: 100, unit: 'g' }, mealType: 'LUNCH',
  consumedAt: '2026-11-24T12:15:00+07:00', timeZone: 'Asia/Saigon', notes: 'synthetic',
};

async function withServer(diaries, reports, run) {
  const app = express();
  app.use(express.json());
  app.use('/api/v1/me/meal-entries', diaries);
  app.use('/api/v1/me/nutrition-report', reports);
  const server = await new Promise(resolve => { const value = app.listen(0, '127.0.0.1', () => resolve(value)); });
  try { await run(`http://127.0.0.1:${server.address().port}/api/v1/me`); }
  finally { await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
}

function testConsent(_req, _res, next) {
  _req.auth = { user: { id: ownerId } };
  _req.userDatabase = {};
  next();
}

test('private diary creates only server-resolved nguồn thử nghiệm data and requires idempotency', async () => {
  let providerId;
  let createInput;
  let createCalls = 0;
  const repository = {
    async replay() { return null; },
    async create(value) { createCalls += 1; createInput = value; return { item: value.item, replayed: false }; },
    async listForReport() { return []; },
    async get() { return null; },
  };
  const foodSource = { async getFood(id) { providerId = id; return food; } };
  await withServer(createAccountMealEntryRouter({ foodSource, repository, requireCurrentConsent: testConsent }), createNutritionReportRouter({ repository, requireCurrentConsent: testConsent }), async base => {
    const saved = await fetch(`${base}/meal-entries`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'diary-intent-001' }, body: JSON.stringify(input) });
    assert.equal(saved.status, 201);
    const body = await saved.json();
    assert.equal(providerId, '12345');
    assert.equal(createInput.userId, ownerId);
    assert.equal(body.item.nutrients.energyKcal, 127);
    assert.equal(body.item.nutrients.fiberG, null);
    assert.equal(body.item.source.recordId, '12345');
    assert.equal(createInput.input.notes, 'synthetic');

    const missingKey = await fetch(`${base}/meal-entries`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
    assert.equal(missingKey.status, 400);
    assert.equal(createCalls, 1);

    const tampered = await fetch(`${base}/meal-entries`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'diary-intent-002' }, body: JSON.stringify({ ...input, nutrients: { energyKcal: 999 }, source: { id: 'forged' } }) });
    assert.equal(tampered.status, 400);
    assert.equal(createCalls, 1);
  });
});

test('create retry replays owner snapshot without calling the nguồn thử nghiệm provider', async () => {
  const savedItem = { id: 'entry-1', foodId: food.id, foodName: food.name, nutrients: { energyKcal: 127 }, source: food.source };
  let providerCalls = 0;
  const repository = {
    async replay(value) { assert.equal(value.userId, ownerId); return { item: savedItem, replayed: true }; },
    async create() { assert.fail('retry must not insert'); },
  };
  await withServer(createAccountMealEntryRouter({ foodSource: { async getFood() { providerCalls += 1; throw new Error('offline'); } }, repository, requireCurrentConsent: testConsent }), createNutritionReportRouter({ repository, requireCurrentConsent: testConsent }), async base => {
    const response = await fetch(`${base}/meal-entries`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': 'diary-intent-001' }, body: JSON.stringify(input) });
    assert.equal(response.status, 200);
    assert.equal((await response.json()).item.id, 'entry-1');
  });
  assert.equal(providerCalls, 0);
});

test('daily route uses local day boundaries and distinguishes empty totals from unknown nutrient values', async () => {
  let query;
  const repository = { async listForReport(value) { query = value; return []; } };
  await withServer(createAccountMealEntryRouter({ foodSource: { getFood() {} }, repository, requireCurrentConsent: testConsent }), createNutritionReportRouter({ repository, requireCurrentConsent: testConsent }), async base => {
    const empty = await fetch(`${base}/meal-entries?date=2026-11-24&timeZone=Asia%2FSaigon`);
    const body = await empty.json();
    assert.equal(empty.status, 200);
    assert.equal(body.hasEntries, false);
    assert.equal(body.totals, null);
    assert.equal(query.userId, ownerId);
    assert.equal(query.start.toISOString(), '2026-11-23T17:00:00.000Z');
    assert.equal(query.end.toISOString(), '2026-11-24T17:00:00.000Z');
  });
});

test('nutrition report has bounded date range and explicit no-entry and missing-value days', async () => {
  const reportRepository = { async listForReport() { return [{
    id: 'entry-1', consumedAt: '2026-11-24T05:15:00.000Z', nutrients: { energyKcal: 127, proteinG: 8, carbohydrateG: 20, fatG: 1, fiberG: null, sodiumMg: 2 },
    source: food.source, catalogVersion: food.catalogVersion,
  }]; } };
  await withServer(createAccountMealEntryRouter({ foodSource: { getFood() {} }, repository: reportRepository, requireCurrentConsent: testConsent }), createNutritionReportRouter({ repository: reportRepository, requireCurrentConsent: testConsent }), async base => {
    const response = await fetch(`${base}/nutrition-report?date=2026-11-24&timeZone=Asia%2FSaigon&days=2`);
    const report = await response.json();
    assert.equal(report.days.length, 2);
    assert.deepEqual(report.days[0], { date: '2026-11-23', hasEntries: false, totals: null });
    assert.equal(report.days[1].hasEntries, true);
    assert.equal(report.days[1].totals.fiberG, null);
    assert.equal(report.sources[0].recordId, '12345');

    const invalid = await fetch(`${base}/nutrition-report?date=2026-11-24&timeZone=Asia%2FSaigon&days=32`);
    assert.equal(invalid.status, 400);
  });
});
