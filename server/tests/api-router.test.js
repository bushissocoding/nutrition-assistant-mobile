const assert = require('node:assert/strict');
const express = require('express');
const { once } = require('node:events');
const test = require('node:test');
const { createApiRouter } = require('../src/routes/api');

test('makes the composed demo context available to downstream feature routers', async t => {
  const demoContext = { store: {}, requireScope() {} };
  const router = createApiRouter({ foods: [], mealTemplates: [] }, { demoContext });
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
