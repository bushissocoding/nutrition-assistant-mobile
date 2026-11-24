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

test('mounts sourced USDA search routes without changing the existing food route', async t => {
  const demoContext = { store: { readCollection() {}, updateCollection() {}, writeCollection() {} }, requireScope() {} };
  const foodSource = { async search(query, options) { return { items: [], query, page: options.page, source: { id: 'USDA-FDC' } }; } };
  const router = createApiRouter({ foods: [], mealTemplates: [], catalog: {} }, demoContext, { foodSource });
  const app = express(); app.use('/api/v1', router);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/foods/search?q=beans&page=3`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { items: [], query: 'beans', page: 3, source: { id: 'USDA-FDC' } });
});
