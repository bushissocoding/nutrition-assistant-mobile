const test = require('node:test');
const assert = require('node:assert/strict');
const { createApiClient, createApiMethods, ApiClientError } = require('./api-client.cjs');
const { ApiConfigurationError } = require('./api-config.cjs');

function createResponse(status, body = '') {
  return {
    status,
    ok: status >= 200 && status < 300,
    async text() { return body; },
  };
}

function createClient(fetchImpl, overrides = {}) {
  return createApiClient({
    baseUrl: 'http://127.0.0.1:4000',
    fetchImpl,
    namespaceStore: { async getNamespace() { return 'demo-test-device'; } },
    timeoutMs: 100,
    ...overrides,
  });
}

test('exposes the existing API methods with their original v1 paths and payloads', async () => {
  const calls = [];
  const api = createApiMethods({
    async request(path, options) { calls.push({ path, options }); return { ok: true }; },
  });
  const plan = { servings: 2, allergies: ['peanut'] };
  const foods = await api.getFoods('rau muống');
  await api.calculateNutrition([{ foodId: 'food-1', grams: 150 }]);
  await api.generateMealPlan(plan);

  assert.deepEqual(foods, { ok: true });
  assert.deepEqual(calls, [
    { path: '/api/v1/foods?q=rau%20mu%E1%BB%91ng', options: undefined },
    { path: '/api/v1/nutrition/calculate', options: { method: 'POST', body: '{"items":[{"foodId":"food-1","grams":150}]}' } },
    { path: '/api/v1/meal-plans/generate', options: { method: 'POST', body: JSON.stringify(plan) } },
  ]);
});

test('rejects invalid API configuration before namespace lookup or network I/O', async () => {
  let namespaceReads = 0;
  let fetchCalls = 0;
  const client = createApiClient({
    baseUrl: undefined,
    fetchImpl: async () => { fetchCalls += 1; },
    namespaceStore: { async getNamespace() { namespaceReads += 1; return 'demo-test'; } },
  });

  await assert.rejects(client.request('/api/v1/foods'), ApiConfigurationError);
  assert.equal(namespaceReads, 0);
  assert.equal(fetchCalls, 0);
});

test('sends JSON request with the stable demo namespace and returns parsed data', async () => {
  let request;
  const client = createClient(async (url, options) => {
    request = { url, options };
    return createResponse(200, '{"items":[{"id":"food-1"}]}');
  });

  const result = await client.request('/api/v1/meal-plans/generate', {
    method: 'POST',
    body: JSON.stringify({ servings: 2 }),
  });

  assert.deepEqual(result, { items: [{ id: 'food-1' }] });
  assert.equal(request.url, 'http://127.0.0.1:4000/api/v1/meal-plans/generate');
  assert.equal(request.options.method, 'POST');
  assert.equal(request.options.body, '{"servings":2}');
  assert.equal(request.options.headers['Content-Type'], 'application/json');
  assert.equal(request.options.headers['X-Demo-Namespace'], 'demo-test-device');
  assert.ok(request.options.signal instanceof AbortSignal);
});

test('returns null for HTTP 204 without trying to parse a response body', async () => {
  const client = createClient(async () => ({
    status: 204,
    ok: true,
    async text() { assert.fail('204 response has no JSON body'); },
  }));

  assert.equal(await client.request('/api/v1/demo/items/1', { method: 'DELETE' }), null);
});

test('maps HTTP errors to typed errors and keeps the status and server message', async () => {
  const client = createClient(async () => createResponse(403, '{"error":"Không có quyền truy cập."}'));

  await assert.rejects(client.request('/api/v1/demo/items/1'), error => {
    assert.ok(error instanceof ApiClientError);
    assert.equal(error.code, 'API_HTTP_ERROR');
    assert.equal(error.status, 403);
    assert.equal(error.message, 'Không có quyền truy cập.');
    return true;
  });
});

test('uses a retry-later message for server errors without exposing an invalid body', async () => {
  const client = createClient(async () => createResponse(503, '<html>unavailable</html>'));

  await assert.rejects(client.request('/api/v1/foods'), error => {
    assert.equal(error.code, 'API_HTTP_ERROR');
    assert.equal(error.status, 503);
    assert.equal(error.message, 'Máy chủ đang gặp sự cố. Hãy thử lại sau.');
    return true;
  });
});

test('rejects malformed successful JSON as an invalid response', async () => {
  const client = createClient(async () => createResponse(200, '{not-json'));

  await assert.rejects(client.request('/api/v1/foods'), error => {
    assert.equal(error.code, 'API_RESPONSE_INVALID');
    return true;
  });
});

test('maps rejected fetch calls to a network error without retrying', async () => {
  let calls = 0;
  const client = createClient(async () => {
    calls += 1;
    throw new Error('network down');
  });

  await assert.rejects(client.request('/api/v1/demo/items', { method: 'POST' }), error => {
    assert.equal(error.code, 'API_NETWORK_ERROR');
    return true;
  });
  assert.equal(calls, 1);
});

test('settles a timed-out request even when fetch ignores abort and does not retry', async () => {
  let calls = 0;
  const client = createClient(() => {
    calls += 1;
    return new Promise(() => {});
  }, { timeoutMs: 10 });

  await assert.rejects(client.request('/api/v1/demo/items', { method: 'POST' }), error => {
    assert.equal(error.code, 'API_TIMEOUT');
    return true;
  });
  assert.equal(calls, 1);
});

test('applies the request deadline while loading the namespace and does not fetch afterward', async () => {
  let fetchCalls = 0;
  const client = createClient(async () => {
    fetchCalls += 1;
    return createResponse(200, '{}');
  }, {
    timeoutMs: 10,
    namespaceStore: { async getNamespace() { await new Promise(resolve => setTimeout(resolve, 25)); return 'demo-test-device'; } },
  });

  await assert.rejects(client.request('/api/v1/foods'), error => error.code === 'API_TIMEOUT');
  await new Promise(resolve => setTimeout(resolve, 30));
  assert.equal(fetchCalls, 0);
}, { timeout: 1000 });

test('caller abort settles even when fetch ignores abort', async () => {
  const client = createClient(() => new Promise(() => {}));
  const controller = new AbortController();
  const request = client.request('/api/v1/foods', { signal: controller.signal });
  controller.abort();

  await assert.rejects(request, error => {
    assert.equal(error.code, 'API_REQUEST_ABORTED');
    return true;
  });
});
