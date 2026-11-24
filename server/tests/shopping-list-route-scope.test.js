const assert = require('node:assert/strict');
const express = require('express');
const { once } = require('node:events');
const test = require('node:test');
const { createDemoScopeMiddleware } = require('../src/middleware/demo-scope');
const { createShoppingListRouter } = require('../src/routes/shopping-lists');

async function requestCurrentList(t, env) {
  const demoContext = {
    store: { readCollection: async () => [], updateCollection: async (_namespace, _collection, update) => update([]) },
    requireScope: createDemoScopeMiddleware({ env }),
  };
  const app = express();
  app.use('/api/v1/shopping-lists', createShoppingListRouter({ foods: [], demoContext }));
  const server = app.listen(0);
  await once(server, 'listening');
  t.after(() => new Promise(resolve => {
    server.close(resolve);
    server.closeAllConnections();
  }));
  return fetch(`http://127.0.0.1:${server.address().port}/api/v1/shopping-lists/current`, { headers: { 'X-Demo-Namespace': 'demo-scope-test' } });
}

test('shopping list routes reject demo requests while storage is disabled', async t => {
  const response = await requestCurrentList(t, { NODE_ENV: 'development' });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, 'DEMO_DATA_DISABLED');
});

test('shopping list routes remain disabled in production even when the demo flag is enabled', async t => {
  const response = await requestCurrentList(t, { NODE_ENV: 'production', DEMO_DATA_ENABLED: 'true' });
  assert.equal(response.status, 503);
  assert.equal((await response.json()).code, 'DEMO_DATA_DISABLED');
});
