const assert = require('node:assert/strict');
const express = require('express');
const { once } = require('node:events');
const test = require('node:test');
const { createHealthRecordRouter } = require('../src/routes/health-records');

async function withServer(t, repository, options = {}) {
  const app = express();
  app.use(express.json());
  app.use('/records', (req, _res, next) => { req.auth = { user: { id: 'account-1' } }; req.userDatabase = {}; next(); }, createHealthRecordRouter({
    repository,
    requireHealthRecordConsent(_req, _res, next) { next(); },
    ...options,
  }));
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  return `http://127.0.0.1:${server.address().port}/records`;
}

test('requires every lab value to be explicitly confirmed before saving', async t => {
  let saveCalls = 0;
  const baseUrl = await withServer(t, { async save() { saveCalls += 1; return { id: 'record-1' }; } });
  const response = await fetch(baseUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({
    title: 'Blood panel', sourceDate: '2026-11-24', note: '',
    results: [{ name: 'Glucose', value: '5.4', unit: 'mmol/L', referenceRange: '', confirmed: false }],
  }) });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).code, 'INVALID_HEALTH_RECORD');
  assert.equal(saveCalls, 0);
});

test('saves reviewed result rows and scopes repository operations to the authenticated user', async t => {
  const calls = [];
  const baseUrl = await withServer(t, {
    async save(input) { calls.push(input); return { id: 'record-1', ...input.input }; },
  });
  const payload = { title: 'Blood panel', sourceDate: null, note: 'Morning', results: [{ name: 'Glucose', value: '5.4', unit: 'mmol/L', referenceRange: '', confirmed: true }] };
  const response = await fetch(baseUrl, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': '01380e6e-b95f-4bd5-8f38-a1391ae3bda1' }, body: JSON.stringify(payload) });
  assert.equal(response.status, 201);
  assert.equal((await response.json()).record.id, 'record-1');
  assert.equal(calls[0].userId, 'account-1');
  assert.equal(calls[0].requestKey, '01380e6e-b95f-4bd5-8f38-a1391ae3bda1');
  assert.deepEqual(calls[0].input, payload);
});

test('accepts only bounded binary image uploads and forwards the authenticated owner', async t => {
  const calls = [];
  const baseUrl = await withServer(t, {
    async uploadSource(input) { calls.push(input); return { id: input.recordId, source: { available: true } }; },
  });
  const bytes = Buffer.from([0xff, 0xd8, 0xff, 0x00]);
  const response = await fetch(`${baseUrl}/01380e6e-b95f-4bd5-8f38-a1391ae3bda1/source`, {
    method: 'PUT', headers: { 'Content-Type': 'application/octet-stream', 'X-Record-Content-Type': 'image/jpeg' }, body: bytes,
  });
  assert.equal(response.status, 200);
  assert.equal(calls[0].userId, 'account-1');
  assert.equal(calls[0].recordId, '01380e6e-b95f-4bd5-8f38-a1391ae3bda1');
  assert.deepEqual(calls[0].bytes, bytes);
  assert.equal(calls[0].mimeType, 'image/jpeg');
});

test('caps concurrent image uploads and releases capacity when an upload finishes', async t => {
  let markEntered;
  let releaseFirst;
  const entered = new Promise(resolve => { markEntered = resolve; });
  const firstUploadGate = new Promise(resolve => { releaseFirst = resolve; });
  let uploads = 0;
  const baseUrl = await withServer(t, {
    async uploadSource(input) {
      uploads += 1;
      if (uploads === 1) { markEntered(); await firstUploadGate; }
      return { id: input.recordId, source: { available: true } };
    },
  }, { maxConcurrentUploads: 1 });
  const uploadUrl = `${baseUrl}/01380e6e-b95f-4bd5-8f38-a1391ae3bda1/source`;
  const request = () => fetch(uploadUrl, {
    method: 'PUT', headers: { 'Content-Type': 'application/octet-stream', 'X-Record-Content-Type': 'image/jpeg' },
    body: Buffer.from([0xff, 0xd8, 0xff, 0x00]),
  });

  const firstResponse = request();
  await entered;
  const saturatedResponse = await request();
  assert.equal(saturatedResponse.status, 503);
  assert.equal(saturatedResponse.headers.get('retry-after'), '1');
  assert.equal((await saturatedResponse.json()).code, 'HEALTH_RECORD_UPLOAD_CAPACITY_REACHED');
  assert.equal(uploads, 1);

  releaseFirst();
  assert.equal((await firstResponse).status, 200);
  assert.equal((await request()).status, 200);
  assert.equal(uploads, 2);
});

test('rejects malformed record identifiers before repository access', async t => {
  let calls = 0;
  const baseUrl = await withServer(t, { async get() { calls += 1; return null; } });
  const response = await fetch(`${baseUrl}/not-a-uuid`);
  assert.equal(response.status, 404);
  assert.equal(calls, 0);
});
