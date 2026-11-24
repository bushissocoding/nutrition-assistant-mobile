const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const express = require('express');
const { once } = require('node:events');
const test = require('node:test');
const { createApiRouter } = require('../src/routes/api');
const { CURRENT_CONSENT_VERSION, hasRequiredConsent, parseConsentChoices } = require('../src/services/consent');
const { parseProfileInput } = require('../src/services/profile');

const profileInput = Object.freeze({
  username: 'synthetic_user', mode: 'healthy', gender: 'unspecified', age: 35,
  heightCm: 165, weightKg: 60, activityLevel: 'moderate', conditionType: 'unspecified',
  allergies: ['peanuts'], symptomNotes: '', redFlags: [], diagnosisNotes: '', hardLimits: {}, medicalLimitsConfirmed: false,
});
const consentInput = Object.freeze({
  profile_processing: true, nutrition_processing: true, data_lifecycle: true,
  ai_processing: false, health_record_storage: false,
});

function createDatabasePool() {
  const rows = { profiles: new Map(), consent_records: new Map() };
  const nextId = () => `synthetic-record-${Math.random().toString(36).slice(2)}`;
  const databaseFor = userId => ({
    from(table) {
      let operation = 'select';
      let payload = null;
      return {
        select() { return this; },
        eq(column, value) { if (column === 'id' && value !== userId) this.owner = value; if (column === 'user_id' && value !== userId) this.owner = value; return this; },
        order() { return this; },
        limit() { return this; },
        maybeSingle: async () => {
          const map = rows[table];
          const row = table === 'profiles' ? map.get(userId) : map.get(userId)?.at(-1);
          return { data: row || null, error: null };
        },
        insert(value) { operation = 'insert'; payload = value; return this; },
        upsert(value) { operation = 'upsert'; payload = value; return this; },
        single: async () => {
          if (operation === 'insert') {
            if (payload.user_id !== userId) return { data: null, error: { code: '42501' } };
            const row = { id: nextId(), version: payload.version, choices: payload.choices, accepted_at: '2026-11-24T00:00:00.000Z' };
            rows[table].set(userId, [...(rows[table].get(userId) || []), row]);
            return { data: row, error: null };
          }
          if (operation === 'upsert') {
            if (payload.id !== userId) return { data: null, error: { code: '42501' } };
            const row = { ...payload, created_at: '2026-11-24T00:00:00.000Z', updated_at: '2026-11-24T00:00:00.000Z' };
            rows[table].set(userId, row);
            return { data: row, error: null };
          }
          return { data: null, error: null };
        },
      };
    },
  });
  return { rows, databaseFor };
}

function createTestAuth(pool) {
  return (req, res, next) => {
    const token = req.get('Authorization')?.replace(/^Bearer\s+/i, '');
    if (!token) return res.status(401).json({ error: 'login required', code: 'AUTHENTICATION_REQUIRED' });
    req.auth = { user: { id: token } };
    req.userDatabase = pool.databaseFor(token);
    return next();
  };
}

async function withTestApi(t) {
  const pool = createDatabasePool();
  const context = { store: { readCollection() {}, updateCollection() {}, writeCollection() {} }, requireScope() {} };
  const app = express();
  app.use(express.json());
  app.use('/api/v1', createApiRouter({ foods: [], mealTemplates: [], catalog: {} }, context, { authMiddleware: createTestAuth(pool) }));
  const server = app.listen(0);
  await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const request = async (pathName, { token = 'synthetic-user-a', method = 'GET', body } = {}) => fetch(`http://127.0.0.1:${server.address().port}/api/v1${pathName}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { request, pool };
}

test('profile parser validates every field, converts storage names and rejects ownership fields', () => {
  const parsed = parseProfileInput(profileInput);
  assert.equal(parsed.height_cm, 165);
  assert.deepEqual(parsed.allergies, ['peanuts']);
  assert.throws(() => parseProfileInput({ ...profileInput, userId: 'other-user' }), { code: 'INVALID_PROFILE' });
  assert.throws(() => parseProfileInput({ ...profileInput, weightKg: 501 }), { code: 'INVALID_PROFILE' });
  assert.throws(() => parseProfileInput({ ...profileInput, allergies: ['milk', 'milk'] }), { code: 'INVALID_PROFILE' });
  assert.throws(() => parseProfileInput({ ...profileInput, mode: 'patient', medicalLimitsConfirmed: true }), { code: 'INVALID_PROFILE' });
});

test('consent schema requires explicit booleans and only current required choices unblock processing', () => {
  assert.deepEqual(parseConsentChoices(consentInput), consentInput);
  assert.equal(parseConsentChoices({ ...consentInput, surprise: true }), null);
  assert.equal(parseConsentChoices({ ...consentInput, profile_processing: 'yes' }), null);
  assert.equal(hasRequiredConsent({ version: CURRENT_CONSENT_VERSION, choices: consentInput }), true);
  assert.equal(hasRequiredConsent({ version: 'old', choices: consentInput }), false);
  assert.equal(hasRequiredConsent({ version: CURRENT_CONSENT_VERSION, choices: { ...consentInput, nutrition_processing: false } }), false);
});

test('profile and consent tables have owner RLS, server timestamps, and append-only client grants', () => {
  const migration = fs.readFileSync(path.join(__dirname, '../../supabase/migrations/202611240001_identity_profile_consent.sql'), 'utf8');
  assert.match(migration, /alter table public\.profiles enable row level security/i);
  assert.match(migration, /alter table public\.consent_records enable row level security/i);
  assert.match(migration, /id\s*=\s*\(select auth\.uid\(\)\)/i);
  assert.match(migration, /user_id\s*=\s*\(select auth\.uid\(\)\)/i);
  assert.match(migration, /accepted_at timestamptz not null default now\(\)/i);
  assert.match(migration, /grant insert \(user_id, version, choices\) on public\.consent_records to authenticated/i);
  assert.match(migration, /profiles_delete_own[\s\S]*for delete to authenticated using \(id = \(select auth\.uid\(\)\)\)/i);
  assert.doesNotMatch(migration, /grant\s+(update|delete|all)\s+on\s+public\.consent_records\s+to\s+authenticated/i);
});

test('identity routes require auth, require current consent for profile, and ignore body ownership', async t => {
  const { request, pool } = await withTestApi(t);
  assert.equal((await request('/me/profile', { token: null })).status, 401);
  assert.equal((await request('/me/profile')).status, 403);
  assert.equal((await request('/me/care/providers', { token: null })).status, 401);
  assert.equal((await request('/me/care/providers')).status, 403);
  assert.equal((await request('/webhooks/payos', { token: null, method: 'POST', body: {} })).status, 503);

  const consentResponse = await request('/me/consent', { method: 'PUT', body: { choices: consentInput } });
  assert.equal(consentResponse.status, 201);
  const receipt = await consentResponse.json();
  assert.equal(receipt.consent.version, CURRENT_CONSENT_VERSION);
  assert.equal(receipt.consent.choices.ai_processing, false);

  const invalid = await request('/me/profile', { method: 'PUT', body: { ...profileInput, userId: 'synthetic-user-b' } });
  assert.equal(invalid.status, 400);

  const saved = await request('/me/profile', { method: 'PUT', body: profileInput });
  assert.equal(saved.status, 200);
  assert.equal((await saved.json()).profile.username, 'synthetic_user');
  assert.equal(pool.rows.profiles.has('synthetic-user-a'), true);
  assert.equal(pool.rows.profiles.has('synthetic-user-b'), false);

  await request('/me/consent', { token: 'synthetic-user-b', method: 'PUT', body: { choices: consentInput } });
  const isolated = await request('/me/profile', { token: 'synthetic-user-b' });
  assert.deepEqual(await isolated.json(), { profile: null });
});
