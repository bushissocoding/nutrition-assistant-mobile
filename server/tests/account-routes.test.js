const test = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { createAccountRouter } = require('../src/routes/account');

async function withServer(router, run) {
  const app = express();
  app.use('/api/v1/me', (req, _res, next) => {
    req.auth = { user: { id: 'synthetic-user', email: 'person@example.test' } };
    req.userDatabase = { from: table => {
      const query = {
        select() { return this; },
        eq() { return this; },
        is() { return this; },
        in() { return this; },
        order() { return this; },
        async range() { return { data: [], error: null }; },
        maybeSingle: async () => ({ data: null, error: null }),
        then(resolve, reject) { return Promise.resolve({ data: [], error: null }).then(resolve, reject); },
      };
      return query;
    } };
    next();
  }, router);
  const server = await new Promise(resolve => {
    const listening = app.listen(0, '127.0.0.1', () => resolve(listening));
  });
  try { await run(`http://127.0.0.1:${server.address().port}/api/v1/me`); }
  finally { await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve())); }
}

test('account export returns the authenticated account export DTO', async () => {
  await withServer(createAccountRouter(), async base => {
    const response = await fetch(`${base}/export`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.deepEqual(body.identity, { id: 'synthetic-user', email: 'person@example.test' });
    assert.deepEqual(body.consentRecords, []);
  });
});

test('account deletion does not report success when missing or failed', async () => {
  await withServer(createAccountRouter(), async base => {
    const response = await fetch(base, { method: 'DELETE' });
    assert.equal(response.status, 503);
    assert.equal((await response.json()).code, 'ACCOUNT_DELETE_UNAVAILABLE');
  });
  await withServer(createAccountRouter({ deleteAccount: async () => { throw new Error('private provider detail'); } }), async base => {
    const response = await fetch(base, { method: 'DELETE' });
    assert.equal(response.status, 503);
    assert.equal((await response.json()).code, 'ACCOUNT_DELETE_PENDING');
  });
});

test('account deletion returns no content only after the deletion service completes', async () => {
  let received;
  await withServer(createAccountRouter({ deleteAccount: async input => { received = input; } }), async base => {
    const response = await fetch(base, { method: 'DELETE' });
    assert.equal(response.status, 204);
    assert.equal(await response.text(), '');
  });
  assert.equal(received.userId, 'synthetic-user');
});
