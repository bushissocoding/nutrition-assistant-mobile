const assert = require('node:assert/strict');
const express = require('express');
const { once } = require('node:events');
const test = require('node:test');
const { createDemoScopeMiddleware } = require('../src/middleware/demo-scope');

async function requestProtectedRoute(t, env, namespace) {
  const app = express();
  app.get('/protected', createDemoScopeMiddleware({ env }), (req, res) => {
    res.json({ namespace: req.demoNamespace });
  });
  const server = app.listen(0);
  await once(server, 'listening');
  t.after(() => new Promise(resolve => {
    server.close(resolve);
    server.closeAllConnections();
  }));

  const { port } = server.address();
  const headers = namespace === undefined ? {} : { 'X-Demo-Namespace': namespace };
  return fetch(`http://127.0.0.1:${port}/protected`, { headers });
}

test('rejects requests when demo storage is disabled', async t => {
  const response = await requestProtectedRoute(t, { NODE_ENV: 'development' }, 'demo-client-1');

  assert.equal(response.status, 503);
  assert.match((await response.json()).error, /demo.*tắt/i);
});

test('production rejects demo requests even when the demo flag is true', async t => {
  const response = await requestProtectedRoute(t, { NODE_ENV: 'production', DEMO_DATA_ENABLED: 'true' }, 'demo-client-1');

  assert.equal(response.status, 503);
});

test('rejects requests without a demo namespace', async t => {
  const response = await requestProtectedRoute(t, { NODE_ENV: 'development', DEMO_DATA_ENABLED: 'true' });

  assert.equal(response.status, 400);
  assert.match((await response.json()).error, /X-Demo-Namespace/i);
});

test('rejects malformed demo namespaces', async t => {
  const response = await requestProtectedRoute(t, { NODE_ENV: 'development', DEMO_DATA_ENABLED: 'true' }, '../another-user');

  assert.equal(response.status, 400);
});

test('passes a valid demo namespace to the route handler', async t => {
  const response = await requestProtectedRoute(t, { NODE_ENV: 'development', DEMO_DATA_ENABLED: 'true' }, 'demo-client-1');

  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { namespace: 'demo-client-1' });
});
