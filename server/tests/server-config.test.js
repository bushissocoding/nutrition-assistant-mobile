const test = require('node:test');
const assert = require('node:assert/strict');
const { readServerConfig } = require('../src/config/server-config');

const validProductionEnv = {
  NODE_ENV: 'production',
  CORS_ORIGIN: 'https://app.example.test',
  SUPABASE_URL: 'https://nutrition-project.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_key',
  SUPABASE_SECRET_KEY: 'sb_secret_test_key',
};

test('server config keeps local defaults and disables demo persistence', () => {
  assert.deepEqual(readServerConfig({}), {
    port: 4000,
    corsOrigin: '*',
    demoDataEnabled: false,
    environment: 'development',
    corsOrigins: ['*'],
    supabase: null,
    fdcApiKey: null,
    payos: null,
  });
});

test('server config accepts an explicit port, CORS value, and demo setting', () => {
  assert.deepEqual(readServerConfig({ PORT: '4401', CORS_ORIGIN: 'http://localhost', DEMO_DATA_ENABLED: 'true' }), {
    port: 4401,
    corsOrigin: 'http://localhost',
    demoDataEnabled: true,
    environment: 'development',
    corsOrigins: ['http://localhost'],
    supabase: null,
    fdcApiKey: null,
    payos: null,
  });
});

test('production requires current Supabase credentials and an explicit HTTPS origin', () => {
  assert.deepEqual(readServerConfig(validProductionEnv), {
    port: 4000,
    corsOrigin: 'https://app.example.test',
    demoDataEnabled: false,
    environment: 'production',
    corsOrigins: ['https://app.example.test'],
    supabase: {
      url: 'https://nutrition-project.supabase.co',
      publishableKey: 'sb_publishable_test_key',
      secretKey: 'sb_secret_test_key',
    },
    fdcApiKey: null,
    payos: null,
  });
});

test('production rejects missing Supabase credentials, wildcard CORS, and enabled demo storage', () => {
  for (const env of [
    { ...validProductionEnv, SUPABASE_URL: undefined },
    { ...validProductionEnv, SUPABASE_PUBLISHABLE_KEY: undefined },
    { ...validProductionEnv, SUPABASE_SECRET_KEY: undefined },
    { ...validProductionEnv, CORS_ORIGIN: '*' },
    { ...validProductionEnv, CORS_ORIGIN: 'https://app.example.test,https://admin.example.test' },
    { ...validProductionEnv, CORS_ORIGIN: undefined },
    { ...validProductionEnv, DEMO_DATA_ENABLED: 'true' },
  ]) {
    assert.throws(() => readServerConfig(env), error => error.code === 'INVALID_SERVER_CONFIG');
  }
});

test('Supabase credentials must be complete, distinct, and use a secure valid URL in production', () => {
  for (const env of [
    { SUPABASE_URL: validProductionEnv.SUPABASE_URL },
    { ...validProductionEnv, SUPABASE_URL: 'not a URL' },
    { ...validProductionEnv, SUPABASE_URL: 'http://nutrition-project.supabase.co' },
    { ...validProductionEnv, SUPABASE_PUBLISHABLE_KEY: validProductionEnv.SUPABASE_SECRET_KEY },
  ]) {
    assert.throws(() => readServerConfig(env), error => error.code === 'INVALID_SERVER_CONFIG');
  }
});

test('invalid credential errors never repeat supplied key material', () => {
  const secret = 'legacy-secret-material-do-not-echo';
  assert.throws(
    () => readServerConfig({ ...validProductionEnv, SUPABASE_SECRET_KEY: secret }),
    error => error.code === 'INVALID_SERVER_CONFIG' && !error.message.includes(secret),
  );
});

test('server config accepts an explicit false demo setting', () => {
  assert.equal(readServerConfig({ DEMO_DATA_ENABLED: 'false' }).demoDataEnabled, false);
});

test('server config rejects malformed ports without echoing values', () => {
  for (const value of ['abc', '0', '-1', '1.5', '65536', ' ']) {
    assert.throws(
      () => readServerConfig({ PORT: value }),
      error => error.code === 'INVALID_SERVER_CONFIG'
        && error.message.includes('PORT')
        && (!value.trim() || !error.message.includes(value)),
    );
  }
});

test('server config rejects unknown demo flag values', () => {
  for (const value of ['1', 'TRUE', 'yes', ' ']) {
    assert.throws(
      () => readServerConfig({ DEMO_DATA_ENABLED: value }),
      error => error.code === 'INVALID_SERVER_CONFIG'
        && error.message.includes('DEMO_DATA_ENABLED')
        && (!value.trim() || !error.message.includes(value)),
    );
  }
});

test('FDC API key is optional, trimmed, and rejected when malformed without echoing it', () => {
  assert.equal(readServerConfig({ FDC_API_KEY: ' synthetic-food-key ' }).fdcApiKey, 'synthetic-food-key');
  const secret = `bad\nfood-key`;
  assert.throws(() => readServerConfig({ FDC_API_KEY: secret }), error => error.code === 'INVALID_SERVER_CONFIG' && !error.message.includes(secret));
  assert.throws(() => readServerConfig({ FDC_API_KEY: 'x'.repeat(201) }), error => error.code === 'INVALID_SERVER_CONFIG');
});

test('PayOS config stays optional until all server credentials and HTTPS callback URLs are provided', () => {
  assert.deepEqual(readServerConfig({}).payos, null);
  const env = {
    PAYOS_CLIENT_ID: 'client-test', PAYOS_API_KEY: 'api-test', PAYOS_CHECKSUM_KEY: 'checksum-test',
    PAYOS_RETURN_URL: 'https://app.example.test/payment-return', PAYOS_CANCEL_URL: 'https://app.example.test/payment-cancel',
    PAYOS_WEBHOOK_URL: 'https://api.example.test/api/v1/webhooks/payos',
  };
  assert.deepEqual(readServerConfig(env).payos, {
    clientId: 'client-test', apiKey: 'api-test', checksumKey: 'checksum-test',
    returnUrl: 'https://app.example.test/payment-return', cancelUrl: 'https://app.example.test/payment-cancel',
    webhookUrl: 'https://api.example.test/api/v1/webhooks/payos',
  });
  for (const invalid of [
    { ...env, PAYOS_CHECKSUM_KEY: undefined },
    { ...env, PAYOS_RETURN_URL: 'http://app.example.test/payment-return' },
    { ...env, PAYOS_WEBHOOK_URL: 'https://user:pass@api.example.test/webhook' },
  ]) assert.throws(() => readServerConfig(invalid), error => error.code === 'INVALID_SERVER_CONFIG');
});
