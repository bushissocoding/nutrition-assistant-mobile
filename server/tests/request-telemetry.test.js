const assert = require('node:assert/strict');
const express = require('express');
const { once } = require('node:events');
const test = require('node:test');
const { createRequestTelemetryMiddleware, logApiFailure, routeTemplate } = require('../src/observability/request-telemetry');

test('emits generated request IDs and bounded JSON route telemetry without raw path data', async t => {
  const events = [];
  let currentTime = 100;
  const app = express();
  app.use(createRequestTelemetryMiddleware({ logger: { info: line => events.push(JSON.parse(line)), error: line => events.push(JSON.parse(line)) }, idFactory: () => 'generated-id', now: () => currentTime }));
  app.get('/private/records/:recordId', (req, res, next) => {
    currentTime = 123;
    logApiFailure(req, 'record_lookup_failed', 'HEALTH_RECORD_UNAVAILABLE');
    next(new Error('private failure detail'));
  });
  app.use((error, _req, res, _next) => res.status(500).json({ error: error.message }));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));

  const response = await fetch(`http://127.0.0.1:${server.address().port}/private/records/private-account-record-id`);
  await response.arrayBuffer();
  currentTime = 130;
  await new Promise(resolve => setImmediate(resolve));

  assert.equal(response.headers.get('x-request-id'), 'generated-id');
  assert.equal(response.status, 500);
  assert.deepEqual(events, [
    { event: 'record_lookup_failed', entryPoint: 'http_api', requestId: 'generated-id', method: 'GET', route: '/private/records/:recordId', code: 'HEALTH_RECORD_UNAVAILABLE' },
    { event: 'http_request_completed', entryPoint: 'http_api', requestId: 'generated-id', method: 'GET', route: '/private/records/:recordId', statusCode: 500, durationMs: 23 },
  ]);
  assert.equal(JSON.stringify(events).includes('private-account-record-id'), false);
  assert.equal(JSON.stringify(events).includes('private failure detail'), false);
});

test('uses a fixed unmatched route label and a safe failure fallback', () => {
  assert.equal(routeTemplate({ path: '/private/account-secret' }), 'unmatched');
  const events = [];
  logApiFailure({ method: 'POST', path: '/private/account-secret' }, 'request_failed', 'UNAVAILABLE', { logger: { error: line => events.push(JSON.parse(line)) } });
  assert.deepEqual(events, [{ event: 'request_failed', entryPoint: 'http_api', requestId: 'unavailable', method: 'POST', route: 'unmatched', code: 'UNAVAILABLE' }]);
  logApiFailure({ method: 'POST' }, 'request_failed', 'token=private-value', { logger: { error: line => events.push(JSON.parse(line)) } });
  assert.equal(events[1].code, 'UNCLASSIFIED_ERROR');
  assert.equal(JSON.stringify(events).includes('private-value'), false);
});

test('labels mounted API route groups with bounded prefixes and route parameters', () => {
  assert.equal(routeTemplate({ baseUrl: '/api/v1/me/notifications', route: { path: '/:id/read' } }), '/api/v1/me/notifications/:id/read');
  assert.equal(routeTemplate({ baseUrl: '/api/v1/me/notifications/private-user-value', route: { path: '/' } }), '/api/v1/me/notifications');
});
