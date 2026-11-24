const test = require('node:test');
const assert = require('node:assert/strict');
const { createAuthSessionStorage, splitUtf8, utf8Length } = require('./auth-session-storage.cjs');

function createMemoryStorage() {
  const values = new Map();
  return {
    values,
    async getItemAsync(key) { return values.has(key) ? values.get(key) : null; },
    async setItemAsync(key, value) { values.set(key, value); },
    async deleteItemAsync(key) { values.delete(key); },
  };
}

test('splits UTF-8 strings without breaking multibyte characters', () => {
  const value = 'a😀é漢字'.repeat(10);
  const chunks = splitUtf8(value, 12);
  assert.equal(chunks.join(''), value);
  assert.ok(chunks.every(chunk => utf8Length(chunk) <= 12));
});

test('writes chunked auth values and reads them back unchanged', async () => {
  const secureStore = createMemoryStorage();
  const authStorage = createAuthSessionStorage({ storage: secureStore, maxChunkBytes: 24 });
  const session = JSON.stringify({ access_token: 'token-'.repeat(35), refresh_token: 'refresh', user: { id: 'synthetic-account' } });
  await authStorage.setItem('sb-test-auth-token', session);
  assert.equal(await authStorage.getItem('sb-test-auth-token'), JSON.stringify(JSON.parse(session)));
  assert.ok([...secureStore.values.entries()].filter(([key]) => key.includes('.g.') && !key.endsWith('.meta')).every(([, value]) => utf8Length(value) <= 24));
});

test('keeps the prior readable session when committing a new pointer fails', async () => {
  const secureStore = createMemoryStorage();
  const authStorage = createAuthSessionStorage({ storage: secureStore, prefix: 'atomic' });
  await authStorage.setItem('auth-key', JSON.stringify({ access_token: 'first' }));
  const setItemAsync = secureStore.setItemAsync.bind(secureStore);
  secureStore.setItemAsync = async (key, value) => {
    if (key.endsWith('.active')) throw new Error('synthetic secure-store failure');
    return setItemAsync(key, value);
  };
  await assert.rejects(authStorage.setItem('auth-key', JSON.stringify({ access_token: 'second' })), /synthetic secure-store failure/);
  secureStore.setItemAsync = setItemAsync;
  assert.deepEqual(JSON.parse(await authStorage.getItem('auth-key')), { access_token: 'first' });
});

test('falls back to the previous generation when the active payload is corrupt', async () => {
  const secureStore = createMemoryStorage();
  const authStorage = createAuthSessionStorage({ storage: secureStore, prefix: 'recover' });
  await authStorage.setItem('auth-key', JSON.stringify({ access_token: 'first' }));
  await authStorage.setItem('auth-key', JSON.stringify({ access_token: 'second' }));
  const activeKey = [...secureStore.values.keys()].find(key => key.startsWith('recover.') && key.endsWith('.active'));
  const active = await secureStore.getItemAsync(activeKey);
  assert.ok(active);
  const dataKey = [...secureStore.values.keys()].find(key => key.includes(`.g.${active}.0`));
  assert.ok(dataKey);
  secureStore.values.set(dataKey, 'corrupted');
  assert.deepEqual(JSON.parse(await authStorage.getItem('auth-key')), { access_token: 'first' });
});

test('removes active and previous auth session generations', async () => {
  const secureStore = createMemoryStorage();
  const authStorage = createAuthSessionStorage({ storage: secureStore });
  await authStorage.setItem('auth-key', JSON.stringify({ access_token: 'first' }));
  await authStorage.setItem('auth-key', JSON.stringify({ access_token: 'second' }));
  await authStorage.removeItem('auth-key');
  assert.equal(await authStorage.getItem('auth-key'), null);
  assert.equal([...secureStore.values.keys()].filter(key => key.startsWith('nutrition-assistant.auth.v1.')).length, 0);
});
