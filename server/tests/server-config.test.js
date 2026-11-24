const test = require('node:test');
const assert = require('node:assert/strict');
const { readServerConfig } = require('../src/config/server-config');

test('server config keeps local defaults and disables demo persistence', () => {
  assert.deepEqual(readServerConfig({}), {
    port: 4000,
    corsOrigin: '*',
    demoDataEnabled: false,
  });
});

test('server config accepts an explicit port, CORS value, and demo setting', () => {
  assert.deepEqual(readServerConfig({ PORT: '4401', CORS_ORIGIN: 'http://localhost', DEMO_DATA_ENABLED: 'true' }), {
    port: 4401,
    corsOrigin: 'http://localhost',
    demoDataEnabled: true,
  });
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
