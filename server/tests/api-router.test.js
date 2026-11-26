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

test('mounts generic sourced search routes without changing the existing food route', async t => {
  const demoContext = { store: { readCollection() {}, updateCollection() {}, writeCollection() {} }, requireScope() {} };
  const foodSource = { async search(query, options) { return { items: [], query, page: options.page, source: { id: 'synthetic-test-source' } }; } };
  const router = createApiRouter({ foods: [], mealTemplates: [], catalog: {} }, demoContext, { foodSource });
  const app = express(); app.use('/api/v1', router);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/foods/search?q=beans&page=3`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { items: [], query: 'beans', page: 3, source: { id: 'synthetic-test-source' } });
});

test('returns an unavailable meal plan while the Institute catalog is pending', async t => {
  const demoContext = { store: { readCollection() {}, updateCollection() {}, writeCollection() {} }, requireScope() {} };
  const catalog = { version: 'vietnam-nin-pending-v1', status: 'pending', sources: [] };
  const router = createApiRouter({ foods: [], mealTemplates: [], catalog }, demoContext);
  const app = express(); app.use(express.json()); app.use('/api/v1', router);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));

  const response = await fetch('http://127.0.0.1:' + server.address().port + '/api/v1/meal-plans/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contractVersion: 1 }),
  });
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.status, 'unavailable');
  assert.equal(body.unavailability.code, 'FOOD_SOURCE_UNAVAILABLE');
  assert.equal(body.catalog.status, 'pending');
  assert.deepEqual(body.plan, []);
});

test('mounts account chat behind authentication and current-consent checks', async t => {
  const demoContext = { store: { readCollection() {}, updateCollection() {}, writeCollection() {} }, requireScope() {} };
  const router = createApiRouter({ foods: [], mealTemplates: [], catalog: {} }, demoContext, {
    authMiddleware(req, _res, next) { req.auth = { user: { id: 'account-1' } }; req.userDatabase = {}; next(); },
    requireCurrentConsent(_req, _res, next) { next(); },
    chatRepository: { async getAssistantThread({ userId }) { return { threadId: 'thread-1', userId }; } },
  });
  const app = express(); app.use('/api/v1', router);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/me/chat/assistant`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { threadId: 'thread-1', userId: 'account-1' });
});

test('mounts health record APIs behind verified account authentication', async t => {
  const demoContext = { store: { readCollection() {}, updateCollection() {}, writeCollection() {} }, requireScope() {} };
  const router = createApiRouter({ foods: [], mealTemplates: [], catalog: {} }, demoContext, {
    authMiddleware(req, _res, next) { req.auth = { user: { id: 'account-1' } }; req.userDatabase = {}; next(); },
    healthRecordRepository: { async list(input) { return { owner: input.userId, items: [], total: 0, limit: input.limit, offset: input.offset }; } },
  });
  const app = express(); app.use('/api/v1', router);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/me/health-records?limit=5`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { owner: 'account-1', items: [], total: 0, limit: 5, offset: 0 });
});

test('mounts account notifications behind verified authentication', async t => {
  const demoContext = { store: { readCollection() {}, updateCollection() {}, writeCollection() {} }, requireScope() {} };
  const router = createApiRouter({ foods: [], mealTemplates: [], catalog: {} }, demoContext, {
    authMiddleware(req, _res, next) { req.auth = { user: { id: 'account-1' } }; req.userDatabase = {}; next(); },
    notificationRepository: { async getPreferences({ userId }) { return { owner: userId, pushEnabled: false }; } },
  });
  const app = express(); app.use('/api/v1', router);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/me/notifications/preferences`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { preferences: { owner: 'account-1', pushEnabled: false } });
});

test('mounts account personalization behind verified authentication', async t => {
  const demoContext = { store: { readCollection() {}, updateCollection() {}, writeCollection() {} }, requireScope() {} };
  const preferences = { dietaryVariety: 'balanced', foodPreferences: ['Vietnamese'], allergyReminder: true, trackConfirmedTargets: false, updatedAt: null };
  const router = createApiRouter({ foods: [], mealTemplates: [], catalog: {} }, demoContext, {
    authMiddleware(req, _res, next) { req.auth = { user: { id: 'account-1' } }; req.userDatabase = {}; next(); },
    personalizationRepository: { async get({ userId }) { assert.equal(userId, 'account-1'); return preferences; } },
  });
  const app = express(); app.use('/api/v1', router);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/v1/me/personalization`);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { preferences });
});
