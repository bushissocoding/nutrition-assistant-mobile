const test = require('node:test');
const assert = require('node:assert/strict');
const { createCorsMiddleware } = require('../src/middleware/cors');
const { createSecurityHeadersMiddleware } = require('../src/middleware/security-headers');
const { createRateLimitMiddleware } = require('../src/middleware/rate-limit');

function createRequest(headers = {}, ip = '192.0.2.10') {
  return { ip, get: name => headers[name.toLowerCase()] };
}

function createResponse() {
  return {
    statusCode: 200,
    body: undefined,
    headers: {},
    setHeader(name, value) { this.headers[name.toLowerCase()] = value; },
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
    sendStatus(code) { this.statusCode = code; return this; },
  };
}

test('CORS reflects only the configured origin and does not enable cookie credentials', () => {
  const middleware = createCorsMiddleware({ corsOrigins: ['https://app.example.test'], demoDataEnabled: false });
  const req = createRequest({ origin: 'https://app.example.test' });
  const res = createResponse();
  let nextCalls = 0;

  middleware(req, res, () => { nextCalls += 1; });

  assert.equal(res.headers['access-control-allow-origin'], 'https://app.example.test');
  assert.equal(res.headers.vary, 'Origin');
  assert.equal(res.headers['access-control-allow-credentials'], undefined);
  assert.equal(nextCalls, 1);
});

test('CORS rejects unapproved origins, methods, and request headers', () => {
  const middleware = createCorsMiddleware({ corsOrigins: ['https://app.example.test'], demoDataEnabled: false });
  const cases = [
    createRequest({ origin: 'https://attacker.example.test' }),
    createRequest({ origin: 'https://app.example.test', 'access-control-request-method': 'TRACE' }),
    createRequest({ origin: 'https://app.example.test', 'access-control-request-headers': 'x-unapproved' }),
  ];

  for (const req of cases) {
    req.method = 'OPTIONS';
    const res = createResponse();
    let nextCalls = 0;
    middleware(req, res, () => { nextCalls += 1; });
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.code, 'CORS_REQUEST_DENIED');
    assert.equal(nextCalls, 0);
  }
});

test('allowed preflight exposes the bearer header and demo namespace only for local demo mode', () => {
  const middleware = createCorsMiddleware({ corsOrigins: ['http://localhost'], demoDataEnabled: true, environment: 'development' });
  const req = createRequest({
    origin: 'http://localhost',
    'access-control-request-method': 'POST',
    'access-control-request-headers': 'content-type, authorization, x-demo-namespace, idempotency-key',
  });
  req.method = 'OPTIONS';
  const res = createResponse();
  let nextCalls = 0;
  middleware(req, res, () => { nextCalls += 1; });

  assert.equal(res.statusCode, 204);
  const headers = res.headers['access-control-allow-headers'].toLowerCase().split(',').map(value => value.trim());
  for (const header of ['content-type', 'authorization', 'idempotency-key', 'x-demo-namespace']) assert.ok(headers.includes(header));
  assert.equal(nextCalls, 0);
});

test('security headers are set and HSTS is limited to production responses', () => {
  for (const [environment, expectedHsts] of [['development', undefined], ['production', 'max-age=31536000']]) {
    const middleware = createSecurityHeadersMiddleware({ environment });
    const res = createResponse();
    let nextCalls = 0;
    middleware({}, res, () => { nextCalls += 1; });

    assert.equal(res.headers['x-content-type-options'], 'nosniff');
    assert.equal(res.headers['x-frame-options'], 'DENY');
    assert.equal(res.headers['referrer-policy'], 'no-referrer');
    assert.equal(res.headers['strict-transport-security'], expectedHsts);
    assert.equal(nextCalls, 1);
  }
});

test('rate limit rejects requests over budget, expires windows, and ignores forwarded headers', () => {
  let currentTime = 1000;
  const middleware = createRateLimitMiddleware({ limit: 2, windowMs: 1000, now: () => currentTime });
  const request = () => createRequest({ 'x-forwarded-for': '198.51.100.55' }, '192.0.2.10');

  for (let i = 0; i < 2; i += 1) {
    const res = createResponse();
    let nextCalls = 0;
    middleware(request(), res, () => { nextCalls += 1; });
    assert.equal(nextCalls, 1);
  }
  const limited = createResponse();
  middleware(request(), limited, () => assert.fail('limited request must not continue'));
  assert.equal(limited.statusCode, 429);
  assert.equal(limited.body.code, 'RATE_LIMITED');
  assert.equal(limited.headers['retry-after'], '1');

  currentTime += 1000;
  const afterWindow = createResponse();
  let nextCalls = 0;
  middleware(request(), afterWindow, () => { nextCalls += 1; });
  assert.equal(nextCalls, 1);
});

test('rate limiter bounds remembered client keys', () => {
  const middleware = createRateLimitMiddleware({ limit: 10, maxClients: 1, windowMs: 10000, now: () => 1000 });
  const first = createResponse();
  middleware(createRequest({}, '192.0.2.1'), first, () => {});

  const overflow = createResponse();
  middleware(createRequest({}, '192.0.2.2'), overflow, () => assert.fail('full limiter must fail closed'));
  assert.equal(overflow.statusCode, 429);
  assert.equal(overflow.body.code, 'RATE_LIMITED');
});
