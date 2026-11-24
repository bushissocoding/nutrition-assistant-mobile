const test = require('node:test');
const assert = require('node:assert/strict');
const { createUserSupabaseClient } = require('../src/services/supabase/user-client');
const { createPrivilegedSupabaseClient } = require('../src/services/supabase/privileged-client');

const settings = {
  url: 'https://nutrition-project.supabase.co',
  publishableKey: 'sb_publishable_test_key',
  secretKey: 'sb_secret_test_key',
};

test('user-scoped client uses only the publishable key and forwards the user token to RLS', () => {
  let received;
  const expectedClient = { kind: 'user-client' };
  const client = createUserSupabaseClient({
    settings,
    accessToken: 'synthetic-user-access-token',
    createClient: (...args) => {
      received = args;
      return expectedClient;
    },
  });

  assert.equal(client, expectedClient);
  assert.equal(received[0], settings.url);
  assert.equal(received[1], settings.publishableKey);
  assert.equal(received[2].global.headers.Authorization, 'Bearer synthetic-user-access-token');
  assert.deepEqual(received[2].auth, {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  });
  assert.notEqual(received[1], settings.secretKey);
});

test('user-scoped client rejects missing provider configuration or token without echoing sensitive values', () => {
  assert.throws(
    () => createUserSupabaseClient({ settings: null, accessToken: 'private-token' }),
    error => error.code === 'SUPABASE_NOT_CONFIGURED' && !error.message.includes('private-token'),
  );
  assert.throws(
    () => createUserSupabaseClient({ settings, accessToken: ' ' }),
    error => error.code === 'INVALID_AUTH_TOKEN',
  );
});

test('privileged client uses the server secret and never enables session persistence', () => {
  let received;
  const expectedClient = { kind: 'privileged-client' };
  const client = createPrivilegedSupabaseClient({
    settings,
    createClient: (...args) => {
      received = args;
      return expectedClient;
    },
  });

  assert.equal(client, expectedClient);
  assert.equal(received[1], settings.secretKey);
  assert.deepEqual(received[2].auth, {
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  });
});

test('installed Supabase SDK creates usable user and privileged clients without a network request', () => {
  const userClient = createUserSupabaseClient({ settings, accessToken: 'synthetic-user-access-token' });
  const privilegedClient = createPrivilegedSupabaseClient({ settings });

  assert.equal(typeof userClient.auth.getUser, 'function');
  assert.equal(typeof userClient.from, 'function');
  assert.equal(typeof privilegedClient.auth.admin.deleteUser, 'function');
});
