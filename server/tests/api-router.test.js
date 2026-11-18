const assert = require('node:assert/strict');
const express = require('express');
const { once } = require('node:events');
const test = require('node:test');
const { createApiRouter } = require('../src/routes/api');

test('requires a complete demo context when composing the API router', () => {
  assert.throws(() => createApiRouter({ foods: [], mealTemplates: [] }), /demo context/i);
});

test('makes the composed demo context available to downstream feature routers', async t => {
  const demoContext = {
    store: { readCollection() {}, updateCollection() {}, writeCollection() {} },
    requireScope() {},
  };
  const router = createApiRouter({ foods: [], mealTemplates: [] }, demoContext);
  router.get('/context-probe', (req, res) => {
    res.json({ sameContext: req.demoContext === demoContext });
  });
  const app = express();
  app.use('/api/v1', router);
  const server = app.listen(0);
  await once(server, 'listening');
  t.after(() => new Promise(resolve => {
    server.close(resolve);
    server.closeAllConnections();
  }));

  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/context-probe`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { sameContext: true });
});

test('calculation reports mixed nutrient sources and food detail retains prototype notice', async t => {
  const { loadCatalog } = require('../src/repositories/catalog');
  const data = loadCatalog();
  data.foods[0].nutrientSources.proteinG.name = 'Separate test source';
  const demoContext = {
    store: { readCollection() {}, updateCollection() {}, writeCollection() {} },
    requireScope() {},
  };
  const app = express();
  app.use(express.json());
  app.use('/api/v1', createApiRouter(data, demoContext));
  const server = app.listen(0);
  await once(server, 'listening');
  t.after(() => new Promise(resolve => {
    server.close(resolve);
    server.closeAllConnections();
  }));
  const base = `http://127.0.0.1:${server.address().port}/api/v1`;
  const response = await fetch(base + '/nutrition/calculate', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: [{ foodId: data.foods[0].id, grams: 100 }] }),
  });
  assert.equal(response.status, 200);
  const calculated = await response.json();
  assert.ok(calculated.sources.includes('Separate test source'));
  assert.ok(calculated.sources.includes(data.foods[0].source.name));
  const detail = await (await fetch(base + '/foods/' + data.foods[0].id)).json();
  assert.equal(detail.catalog.status, 'prototype');
  assert.equal(detail.catalog.notice, data.catalog.notice);
});
