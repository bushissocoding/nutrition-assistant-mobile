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
    bindAddress: '0.0.0.0',
    corsOrigin: '*',
    demoDataEnabled: false,
    environment: 'development',
    corsOrigins: ['*'],
    supabase: null,
    payos: null,
    assistant: null,
    expoPush: null,
  });
});

test('server config accepts an explicit port, CORS value, and demo setting', () => {
  assert.deepEqual(readServerConfig({ PORT: '4401', CORS_ORIGIN: 'http://localhost', DEMO_DATA_ENABLED: 'true' }), {
    port: 4401,
    bindAddress: '0.0.0.0',
    corsOrigin: 'http://localhost',
    demoDataEnabled: true,
    environment: 'development',
    corsOrigins: ['http://localhost'],
    supabase: null,
    payos: null,
    assistant: null,
    expoPush: null,
  });
});

test('production requires current Supabase credentials and an explicit HTTPS origin', () => {
  assert.deepEqual(readServerConfig(validProductionEnv), {
    port: 4000,
    bindAddress: '0.0.0.0',
    corsOrigin: 'https://app.example.test',
    demoDataEnabled: false,
    environment: 'production',
    corsOrigins: ['https://app.example.test'],
    supabase: {
      url: 'https://nutrition-project.supabase.co',
      publishableKey: 'sb_publishable_test_key',
      secretKey: 'sb_secret_test_key',
    },
    payos: null,
    assistant: null,
    expoPush: null,
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

test('server config supports an explicit IP bind address and rejects hostnames', () => {
  assert.equal(readServerConfig({ API_HOST: '127.0.0.1' }).bindAddress, '127.0.0.1');
  assert.equal(readServerConfig({ API_HOST: '::1' }).bindAddress, '::1');
  for (const value of ['localhost', 'not-an-ip', '  ']) {
    assert.throws(() => readServerConfig({ API_HOST: value }), error => error.code === 'INVALID_SERVER_CONFIG' && (!value.trim() || !error.message.includes(value.trim())));
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

test('OpenAI chat config is optional and requires a bounded server key and explicit model', () => {
  assert.equal(readServerConfig({}).assistant, null);
  assert.deepEqual(readServerConfig({ OPENAI_API_KEY: ' synthetic-openai-key ', OPENAI_MODEL: 'gpt-6.2-sol' }).assistant, {
    apiKey: 'synthetic-openai-key', model: 'gpt-6.2-sol',
  });
  for (const invalid of [
    { OPENAI_API_KEY: 'synthetic-openai-key' },
    { OPENAI_MODEL: 'gpt-6.2-sol' },
    { OPENAI_API_KEY: 'bad\nkey', OPENAI_MODEL: 'gpt-6.2-sol' },
    { OPENAI_API_KEY: 'synthetic-key', OPENAI_MODEL: 'https://attacker.example' },
    { OPENAI_API_KEY: 'x'.repeat(501), OPENAI_MODEL: 'gpt-6.2-sol' },
  ]) assert.throws(() => readServerConfig(invalid), error => error.code === 'INVALID_SERVER_CONFIG');
});

test('Expo Push access token is optional, server-only and bounded', () => {
  assert.equal(readServerConfig({}).expoPush, null);
  assert.deepEqual(readServerConfig({ EXPO_PUSH_ACCESS_TOKEN: ' expo-secret ' }).expoPush, { accessToken: 'expo-secret' });
  assert.throws(() => readServerConfig({ EXPO_PUSH_ACCESS_TOKEN: 'bad\ntoken' }), error => error.code === 'INVALID_SERVER_CONFIG');
  assert.throws(() => readServerConfig({ EXPO_PUSH_ACCESS_TOKEN: 'x'.repeat(501) }), error => error.code === 'INVALID_SERVER_CONFIG');
});
