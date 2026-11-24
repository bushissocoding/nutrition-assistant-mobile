const assert = require('node:assert/strict');
const test = require('node:test');
const { createUserRateLimitMiddleware } = require('../src/middleware/user-rate-limit');

test('limits each authenticated account independently and supplies a retry-after value', () => {
  let currentTime = 1000;
  const limit = createUserRateLimitMiddleware({ limit: 1, windowMs: 100, now: () => currentTime });
  const response = () => ({ headers: {}, statusCode: 200, setHeader(name, value) { this.headers[name] = value; }, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } });
  let nextCalls = 0;
  const first = response();
  limit({ auth: { user: { id: 'user-a' } } }, first, () => { nextCalls += 1; });
  const limited = response();
  limit({ auth: { user: { id: 'user-a' } } }, limited, () => { nextCalls += 1; });
  const separate = response();
  limit({ auth: { user: { id: 'user-b' } } }, separate, () => { nextCalls += 1; });
  assert.equal(nextCalls, 2);
  assert.equal(limited.statusCode, 429);
  assert.equal(limited.body.code, 'RATE_LIMITED');
  assert.equal(limited.headers['Retry-After'], '1');
  currentTime = 1101;
  const reset = response();
  limit({ auth: { user: { id: 'user-a' } } }, reset, () => { nextCalls += 1; });
  assert.equal(reset.statusCode, 200);
  assert.equal(nextCalls, 3);
});

test('rejects missing authenticated identity and validates its configuration', () => {
  assert.throws(() => createUserRateLimitMiddleware({ limit: 0 }), /settings are invalid/i);
  const limit = createUserRateLimitMiddleware();
  const response = { status(code) { this.code = code; return this; }, json(body) { this.body = body; } };
  limit({}, response, () => assert.fail('Unauthenticated request reached the handler'));
  assert.equal(response.code, 401);
  assert.equal(response.body.code, 'AUTHENTICATION_REQUIRED');
});
