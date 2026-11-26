const assert = require('node:assert/strict');
const test = require('node:test');
const { BUCKET, MAX_SOURCE_BYTES, createHealthRecordRepository, isValidImageBytes } = require('../src/repositories/health-record-repository');

const record = { id: '01380e6e-b95f-4bd5-8f38-a1391ae3bda1', user_id: 'account-1', title: 'Blood panel', source_date: null, note: '', file_path: null, file_mime_type: null, file_size: null, created_at: '2026-11-24T00:00:00.000Z', updated_at: '2026-11-24T00:00:00.000Z' };

function createDb({ currentRecord = record, results = [] } = {}) {
  const state = { record: currentRecord };
  return {
    state,
    from(table) {
      if (table === 'health_records') {
        return { select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: state.record, error: null }) }) }) }) };
      }
      if (table === 'health_record_results') {
        return { select: () => ({ eq: () => ({ eq: () => ({ order: () => ({ order: async () => ({ data: results, error: null }) }) }) }) }) };
      }
      assert.fail(`Unexpected table: ${table}`);
    },
    async rpc(name, payload) {
      if (name === 'attach_health_record_source') {
        state.record = { ...state.record, file_path: payload.p_file_path, file_mime_type: payload.p_mime_type, file_size: payload.p_file_size };
        return { data: null, error: null };
      }
      if (name === 'delete_health_record') { state.record = null; return { data: null, error: null }; }
      assert.fail(`Unexpected RPC: ${name} ${JSON.stringify(payload)}`);
    },
  };
}

test('validates JPEG and PNG file signatures and the source byte limit', () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0x01, 0x02, 0x03, 0x04, 0x05]);
  const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  assert.equal(isValidImageBytes(jpeg, 'image/jpeg'), true);
  assert.equal(isValidImageBytes(png, 'image/png'), true);
  assert.equal(isValidImageBytes(jpeg, 'image/png'), false);
  assert.equal(isValidImageBytes(Buffer.alloc(MAX_SOURCE_BYTES + 1), 'image/jpeg'), false);
  assert.equal(isValidImageBytes(jpeg.subarray(0, 4), 'image/jpeg'), false);
});

test('uploads only to a server-derived owner path and attaches validated metadata', async () => {
  const calls = [];
  const storageClient = { storage: { from(bucket) {
    assert.equal(bucket, BUCKET);
    return {
      async upload(path, bytes, options) { calls.push({ path, bytes, options }); return { error: null }; },
      async remove(paths) { calls.push({ removed: paths }); return { error: null }; },
    };
  } } };
  const db = createDb();
  const originalRpc = db.rpc;
  db.rpc = async (name, payload) => { calls.push({ rpc: name, payload }); return originalRpc(name, payload); };
  const repository = createHealthRecordRepository({ storageClient });
  const saved = await repository.uploadSource({ db, userId: 'account-1', recordId: record.id, bytes: Buffer.from([0xff, 0xd8, 0xff, 1, 2, 3, 4, 5]), mimeType: 'image/jpeg' });
  assert.equal(calls[0].path, `account-1/${record.id}`);
  assert.equal(calls[0].options.upsert, true);
  assert.deepEqual(calls[1].payload, { p_record_id: record.id, p_file_path: `account-1/${record.id}`, p_mime_type: 'image/jpeg', p_file_size: 8 });
  assert.equal(saved.id, record.id);
  assert.equal(saved.source.available, true);
});

test('deletes the private object before deleting owner-scoped metadata', async () => {
  const calls = [];
  const existing = { ...record, file_path: `account-1/${record.id}`, file_mime_type: 'image/jpeg', file_size: 8 };
  const db = createDb({ currentRecord: existing });
  const originalRpc = db.rpc;
  db.rpc = async (name, args) => { calls.push({ rpc: name, args }); return originalRpc(name, args); };
  const storageClient = { storage: { from: () => ({ async remove(paths) { calls.push({ remove: paths }); return { error: null }; } }) } };
  const repository = createHealthRecordRepository({ storageClient });
  assert.equal(await repository.delete({ db, userId: 'account-1', recordId: record.id }), true);
  assert.deepEqual(calls, [
    { remove: [`account-1/${record.id}`] },
    { rpc: 'delete_health_record', args: { p_record_id: record.id } },
  ]);
});
