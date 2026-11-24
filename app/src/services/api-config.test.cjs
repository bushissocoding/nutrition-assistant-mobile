const test = require('node:test');
const assert = require('node:assert/strict');
const { ApiConfigurationError, resolveApiBaseUrl } = require('./api-config.cjs');

test('resolveApiBaseUrl rejects an unset URL with a configuration error', () => {
  assert.throws(() => resolveApiBaseUrl(undefined), error => {
    assert.ok(error instanceof ApiConfigurationError);
    assert.equal(error.code, 'API_CONFIG_MISSING');
    return true;
  });
});

test('resolveApiBaseUrl accepts HTTP and HTTPS and removes trailing slashes', () => {
  assert.equal(resolveApiBaseUrl('http://192.168.1.20:4000///'), 'http://192.168.1.20:4000');
  assert.equal(resolveApiBaseUrl('https://api.example.test/v1/'), 'https://api.example.test/v1');
});

test('resolveApiBaseUrl rejects malformed and unsupported URLs', () => {
  for (const value of ['not a url', '//api.example.test', 'ftp://api.example.test', 'file:///tmp/api']) {
    assert.throws(() => resolveApiBaseUrl(value), ApiConfigurationError, value);
  }
});

test('resolveApiBaseUrl rejects embedded credentials, queries, and fragments', () => {
  for (const value of [
    'https://user:password@api.example.test',
    'https://api.example.test?token=secret',
    'https://api.example.test/#fragment',
  ]) {
    assert.throws(() => resolveApiBaseUrl(value), ApiConfigurationError, value);
  }
});
