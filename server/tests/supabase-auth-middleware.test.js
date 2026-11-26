const test = require('node:test');
const assert = require('node:assert/strict');
const { createSupabaseAuthMiddleware } = require('../src/middleware/supabase-auth');

const settings = {
  url: 'https://nutrition-project.supabase.co',
  publishableKey: 'sb_publishable_test_key',
  secretKey: 'sb_secret_test_key',
};

function createResponse() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

async function runMiddleware(middleware, authorization) {
  const req = { get: name => name.toLowerCase() === 'authorization' ? authorization : undefined };
  const res = createResponse();
  let nextCalls = 0;
  await middleware(req, res, () => { nextCalls += 1; });
  return { req, res, nextCalls };
}

test('missing and malformed bearer credentials are rejected before provider access', async () => {
  let clientCreated = false;
  const middleware = createSupabaseAuthMiddleware({
    settings,
    createClient: () => { clientCreated = true; return { auth: { getUser() {} } }; },
  });

  for (const authorization of [undefined, '', 'Basic synthetic-token', 'Bearer first second']) {
    const { res, nextCalls } = await runMiddleware(middleware, authorization);
    assert.equal(res.statusCode, 401);
    assert.equal(res.body.code, 'AUTHENTICATION_REQUIRED');
    assert.equal(nextCalls, 0);
  }
  assert.equal(clientCreated, false);
});

test('a provider-verified account becomes the principal and request-scoped RLS client', async () => {
  const expectedClient = { auth: { getUser: async token => ({ data: { user: { id: 'account-123', email: 'private@example.test', email_confirmed_at: 'synthetic-time', user_metadata: { private: true } } }, error: null, token }) } };
  const middleware = createSupabaseAuthMiddleware({ settings, createClient: () => expectedClient });
  const { req, res, nextCalls } = await runMiddleware(middleware, 'Bearer synthetic-user-token');

  assert.equal(res.statusCode, 200);
  assert.equal(req.userDatabase, expectedClient);
  assert.deepEqual(req.auth, { user: { id: 'account-123', email: 'private@example.test' } });
  assert.equal(nextCalls, 1);
});

test('invalid sessions return a safe 401 without exposing provider details or token text', async () => {
  const middleware = createSupabaseAuthMiddleware({
    settings,
    createClient: () => ({ auth: { getUser: async () => ({ data: { user: null }, error: { status: 401, message: 'rejected private provider detail' } }) } }),
  });
  const { res, nextCalls } = await runMiddleware(middleware, 'Bearer synthetic-user-token');

  assert.equal(res.statusCode, 401);
  assert.equal(res.body.code, 'AUTHENTICATION_REQUIRED');
  assert.doesNotMatch(JSON.stringify(res.body), /rejected private provider detail|synthetic-user-token/);
  assert.equal(nextCalls, 0);
});

test('rejects an unverified email and phone account before creating a private database client', async () => {
  let nextCalled = false;
  const middleware = createSupabaseAuthMiddleware({
    settings,
    createClient: () => ({ auth: { getUser: async () => ({ data: { user: { id: 'unverified-account' } }, error: null }) } }),
  });
  const req = { get: () => 'Bearer synthetic-token' };
  const res = createResponse();
  await middleware(req, res, () => { nextCalled = true; });
  assert.equal(res.statusCode, 403);
  assert.equal(res.body.code, 'ACCOUNT_NOT_VERIFIED');
  assert.equal(nextCalled, false);
  assert.equal(req.userDatabase, undefined);
});

test('identity-provider failures return a retryable 503 instead of treating the session as expired', async () => {
  const middleware = createSupabaseAuthMiddleware({
    settings,
    createClient: () => ({ auth: { getUser: async () => { throw new Error('provider network detail'); } } }),
  });
  const { res, nextCalls } = await runMiddleware(middleware, 'Bearer synthetic-user-token');

  assert.equal(res.statusCode, 503);
  assert.equal(res.body.code, 'AUTH_PROVIDER_UNAVAILABLE');
  assert.doesNotMatch(JSON.stringify(res.body), /provider network detail|synthetic-user-token/);
  assert.equal(nextCalls, 0);
});

test('missing Supabase configuration fails closed without exposing credential values', async () => {
  const middleware = createSupabaseAuthMiddleware({ settings: null });
  const { res, nextCalls } = await runMiddleware(middleware, 'Bearer synthetic-user-token');

  assert.equal(res.statusCode, 503);
  assert.equal(res.body.code, 'AUTH_PROVIDER_UNAVAILABLE');
  assert.equal(nextCalls, 0);
});
