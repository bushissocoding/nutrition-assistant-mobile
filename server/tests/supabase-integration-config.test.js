const test = require('node:test');
const assert = require('node:assert/strict');
const { parseLocalSupabaseStatus, readLocalSupabaseSettings } = require('../integration/local-supabase-config.cjs');

const keys = { PUBLISHABLE_KEY: 'sb_publishable_synthetic', SECRET_KEY: 'sb_secret_synthetic' };

test('accepts only loopback local Supabase settings with current synthetic key formats', () => {
  const config = parseLocalSupabaseStatus(JSON.stringify({ API_URL: 'http://127.0.0.1:54321', ...keys }));
  assert.deepEqual(config, {
    url: 'http://127.0.0.1:54321',
    publishableKey: keys.PUBLISHABLE_KEY,
    secretKey: keys.SECRET_KEY,
  });
});

test('accepts the nested environment map from newer CLI status output', () => {
  const config = parseLocalSupabaseStatus({ env: { API_URL: 'http://localhost:54321', ...keys } });
  assert.equal(config.url, 'http://localhost:54321');
});

test('allows IPv6 loopback while refusing a remote Supabase project', () => {
  const local = parseLocalSupabaseStatus({ env: { API_URL: 'http://[::1]:54321', ...keys } });
  assert.equal(local.url, 'http://[::1]:54321');
  assert.throws(
    () => parseLocalSupabaseStatus({ env: { API_URL: 'https://remote-project.supabase.co', ...keys } }),
    error => error.code === 'LOCAL_SUPABASE_REQUIRED' && !error.message.includes(keys.SECRET_KEY),
  );
});

test('rejects incomplete, legacy-key, and malformed CLI output without echoing key material', () => {
  assert.throws(() => parseLocalSupabaseStatus('{invalid json'), error => error.code === 'LOCAL_SUPABASE_STATUS_INVALID');
  assert.throws(() => parseLocalSupabaseStatus({ env: { API_URL: 'http://localhost:54321', PUBLISHABLE_KEY: keys.PUBLISHABLE_KEY } }), error => error.code === 'LOCAL_SUPABASE_CONFIG_INVALID');
  assert.throws(() => parseLocalSupabaseStatus({ env: { API_URL: 'http://localhost:54321', ANON_KEY: 'legacy-anon', SERVICE_ROLE_KEY: 'legacy-secret' } }), error => error.code === 'LOCAL_SUPABASE_CONFIG_INVALID' && !error.message.includes('legacy-secret'));
});

test('reads only the fixed local status command and suppresses CLI stderr', () => {
  let invocation;
  const settings = readLocalSupabaseSettings({
    execFile(command, args, options) {
      invocation = { command, args, options };
      return JSON.stringify({ API_URL: 'http://localhost:54321', ...keys });
    },
  });
  assert.equal(settings.url, 'http://localhost:54321');
  assert.equal(invocation.command, 'supabase');
  assert.deepEqual(invocation.args, ['status', '--output-format', 'json']);
  assert.deepEqual(invocation.options.stdio, ['ignore', 'pipe', 'ignore']);
});

test('reports an unavailable local CLI without exposing the underlying error', () => {
  const privateDetail = 'do-not-echo-synthetic-secret';
  assert.throws(
    () => readLocalSupabaseSettings({ execFile() { throw new Error(privateDetail); } }),
    error => error.code === 'LOCAL_SUPABASE_STATUS_UNAVAILABLE' && !error.message.includes(privateDetail),
  );
});
