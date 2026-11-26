const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createSourcedFoodRouter } = require('../src/routes/sourced-foods');
const { createFdcFoodSource } = require('../src/services/fdc-food-source');

async function withServer(router, run) {
  const app = express();
  app.use(express.json({ limit: '32kb' }));
  app.use('/api/v1', router);
  const server = await new Promise(resolve => { const value = app.listen(0, '127.0.0.1', () => resolve(value)); });
  try { await run(`http://127.0.0.1:${server.address().port}/api/v1`); }
  finally { await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
}

const record = {
  fdcId: 12345, description: 'Beans', dataType: 'Foundation', publicationDate: '2025-04-01',
  foodNutrients: [
    { nutrient: { id: 1008, unitName: 'kcal' }, amount: 100 },
    { nutrient: { id: 1003, unitName: 'g' }, amount: 10 },
    { nutrient: { id: 1005, unitName: 'g' }, amount: 20 },
    { nutrient: { id: 1004, unitName: 'g' }, amount: 1 },
    { nutrient: { id: 1079, unitName: 'g' }, amount: 3 },
    { nutrient: { id: 1093, unitName: 'mg' }, amount: 2 },
  ],
};

function providerResponse(value) {
  const bytes = Buffer.from(typeof value === 'string' ? value : JSON.stringify(value));
  return { status: 200, ok: true, headers: { get: () => null }, body: new ReadableStream({ start(controller) { controller.enqueue(bytes); controller.close(); } }) };
}

function provider(fetchImpl) {
  return createFdcFoodSource({ apiKey: 'synthetic-key', fetchImpl });
}

test('sourced search validates query and maps provider failures to stable codes', async () => {
  await withServer(createSourcedFoodRouter({ foodSource: provider(async () => providerResponse({ foods: [] })) }), async base => {
    const invalid = await fetch(`${base}/foods/search?q=x`);
    assert.equal(invalid.status, 400);
    assert.equal((await invalid.json()).code, 'INVALID_FOOD_QUERY');
    const page = await fetch(`${base}/foods/search?q=beans&page=2`);
    assert.equal(page.status, 200);
    assert.deepEqual((await page.json()).items, []);
  });
  await withServer(createSourcedFoodRouter(), async base => {
    const response = await fetch(`${base}/foods/search?q=beans`);
    assert.equal(response.status, 503);
    assert.equal((await response.json()).code, 'FOOD_SOURCE_UNAVAILABLE');
  });
});

test('sourced calculation loads authoritative provider records and rejects client nutrient overrides', async () => {
  const source = provider(async () => providerResponse(record));
  await withServer(createSourcedFoodRouter({ foodSource: source }), async base => {
    const valid = await fetch(`${base}/nutrition/calculate-sourced`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: [{ foodId: 'fdc:12345', grams: 50 }] }) });
    assert.equal(valid.status, 200);
    const body = await valid.json();
    assert.equal(body.totals.energyKcal, 50);
    assert.equal(body.totals.proteinG, 5);
    assert.equal(body.items[0].source.recordId, '12345');
    assert.equal(body.items[0].catalogVersion, 'USDA-FDC-live-v1');

    const tampered = await fetch(`${base}/nutrition/calculate-sourced`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: [{ foodId: 'fdc:12345', grams: 50, nutrients: { energyKcal: 999 } }] }) });
    assert.equal(tampered.status, 400);
    assert.equal((await tampered.json()).code, 'INVALID_NUTRITION_REQUEST');
  });
});

test('sourced routes reject malformed page, IDs, empty and excessive portions at the API boundary', async () => {
  await withServer(createSourcedFoodRouter({ foodSource: provider(async () => providerResponse(record)) }), async base => {
    assert.equal((await fetch(`${base}/foods/search?q=beans&page=1000`)).status, 400);
    assert.equal((await fetch(`${base}/foods/fdc/not-an-id`)).status, 400);
    const invalid = await fetch(`${base}/nutrition/calculate-sourced`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: [{ foodId: 'fdc:12345', grams: 5001 }] }) });
    assert.equal(invalid.status, 400);
  });
});
