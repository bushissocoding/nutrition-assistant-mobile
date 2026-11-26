const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createSourcedFoodRouter } = require('../src/routes/sourced-foods');
const { createPendingInstituteFoodSource } = require('../src/services/food-source');

async function withServer(router, run) {
  const app = express();
  app.use(express.json({ limit: '32kb' }));
  app.use('/api/v1', router);
  const server = await new Promise(resolve => { const value = app.listen(0, '127.0.0.1', () => resolve(value)); });
  try { await run(`http://127.0.0.1:${server.address().port}/api/v1`); }
  finally { await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
}

test('food search validates query and page before reporting the pending dataset', async () => {
  await withServer(createSourcedFoodRouter({ foodSource: createPendingInstituteFoodSource() }), async base => {
    const invalidQuery = await fetch(`${base}/foods/search?q=x`);
    assert.equal(invalidQuery.status, 400);
    assert.equal((await invalidQuery.json()).code, 'INVALID_FOOD_QUERY');

    const invalidPage = await fetch(`${base}/foods/search?q=rau&page=101`);
    assert.equal(invalidPage.status, 400);
    assert.equal((await invalidPage.json()).code, 'INVALID_FOOD_PAGE');

    const response = await fetch(`${base}/foods/search?q=rau&page=2`);
    assert.equal(response.status, 503);
    const body = await response.json();
    assert.equal(body.code, 'FOOD_SOURCE_UNAVAILABLE');
    assert.match(body.error, /Viện Dinh dưỡng/);
    assert.match(body.error, /quyền tái phân phối/);
  });
});

test('Institute detail and nutrition calculations stay unavailable until authorized data is integrated', async () => {
  await withServer(createSourcedFoodRouter({ foodSource: createPendingInstituteFoodSource() }), async base => {
    const detail = await fetch(`${base}/foods/vietnam-nin/record-123`);
    assert.equal(detail.status, 503);
    assert.equal((await detail.json()).code, 'FOOD_SOURCE_UNAVAILABLE');

    const calculation = await fetch(`${base}/nutrition/calculate-sourced`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: [{ foodId: 'vietnam-nin:record-123', grams: 100 }] }),
    });
    assert.equal(calculation.status, 503);
    assert.equal((await calculation.json()).code, 'FOOD_SOURCE_UNAVAILABLE');
  });
});

test('sourced calculations validate the request boundary and reject client nutrient overrides', async () => {
  await withServer(createSourcedFoodRouter({ foodSource: createPendingInstituteFoodSource() }), async base => {
    const empty = await fetch(`${base}/nutrition/calculate-sourced`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items: [] }),
    });
    assert.equal(empty.status, 400);

    const malformed = await fetch(`${base}/nutrition/calculate-sourced`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: [{ foodId: 'vietnam-nin:record-123', grams: 100, nutrients: { energyKcal: 999 } }] }),
    });
    assert.equal(malformed.status, 400);
    assert.equal((await malformed.json()).code, 'INVALID_NUTRITION_REQUEST');
  });
});

test('sourced calculations reject IDs outside the registered Institute source before provider lookup', async () => {
  let providerCalls = 0;
  const foodSource = { async getFood() { providerCalls += 1; throw new Error('must not be called'); } };
  await withServer(createSourcedFoodRouter({ foodSource }), async base => {
    const response = await fetch(`${base}/nutrition/calculate-sourced`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: [{ foodId: 'other-source:record-123', grams: 100 }] }),
    });
    assert.equal(response.status, 400);
    assert.equal((await response.json()).code, 'INVALID_FOOD_ID');
  });
  assert.equal(providerCalls, 0);
});
