const assert = require('node:assert/strict');
const express = require('express');
const { once } = require('node:events');
const test = require('node:test');
const { createPersonalizationRouter, normalizePersonalization } = require('../src/routes/personalization');

async function withServer(t, repository) {
  const app = express(); app.use(express.json());
  app.use('/personalization', (req, _res, next) => { req.auth = { user: { id: 'account-1' } }; req.userDatabase = {}; next(); }, createPersonalizationRouter({ repository }));
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return `http://127.0.0.1:${server.address().port}/personalization`;
}

const preferences = { dietaryVariety: 'varied', foodPreferences: ['Vietnamese', 'easy_cook'], allergyReminder: true, trackConfirmedTargets: false };

test('accepts only finite, unique personalization options', () => {
  assert.deepEqual(normalizePersonalization(preferences), preferences);
  for (const invalid of [
    { ...preferences, unknown: true },
    { ...preferences, dietaryVariety: 'medical' },
    { ...preferences, foodPreferences: ['Vietnamese', 'Vietnamese'] },
    { ...preferences, foodPreferences: ['unverified'] },
    { ...preferences, allergyReminder: 'yes' },
    { ...preferences, trackConfirmedTargets: undefined },
  ]) assert.throws(() => normalizePersonalization(invalid), error => error.code === 'INVALID_PERSONALIZATION');
});

test('loads and saves choices only through the authenticated owner repository', async t => {
  const calls = [];
  const repository = {
    async get(input) { calls.push(['get', input]); return preferences; },
    async save(input) { calls.push(['save', input]); return input.preferences; },
  };
  const base = await withServer(t, repository);
  const loaded = await fetch(base);
  assert.deepEqual(await loaded.json(), { preferences });
  const saved = await fetch(base, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(preferences) });
  assert.deepEqual(await saved.json(), { preferences });
  assert.equal(calls[0][1].userId, 'account-1');
  assert.deepEqual(calls[1][1], { db: {}, preferences });
  assert.equal((await fetch(base, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...preferences, allergies: [] }) })).status, 400);
});
