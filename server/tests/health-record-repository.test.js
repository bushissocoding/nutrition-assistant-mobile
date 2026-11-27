const assert = require('node:assert/strict');
const test = require('node:test');
const { BUCKET, MAX_SOURCE_BYTES, createHealthRecordRepository, isValidImageBytes, mapHealthRecordError } = require('../src/repositories/health-record-repository');

const record = { id: '01380e6e-b95f-4bd5-8f38-a1391ae3bda1', user_id: 'account-1', title: 'Blood panel', source_date: null, note: '', file_path: null, file_mime_type: null, file_size: null, file_source_version: 0, created_at: '2026-11-24T00:00:00.000Z', updated_at: '2026-11-24T00:00:00.000Z' };

function createDb({ currentRecord = record, results = [] } = {}) {
  const state = { record: currentRecord, uploads: new Map() };
  if (currentRecord?.file_path) {
    state.uploads.set(currentRecord.file_path, {
      file_path: currentRecord.file_path, user_id: currentRecord.user_id, record_id: currentRecord.id,
      expected_file_path: currentRecord.file_path, expected_source_version: currentRecord.file_source_version, status: 'attached',
    });
  }
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
      if (name === 'begin_health_record_source_upload') {
        if (!state.record || state.record.file_path !== payload.p_expected_file_path
          || state.record.file_source_version !== payload.p_expected_source_version) return { data: false, error: null };
        state.uploads.set(payload.p_file_path, { ...payload, status: 'pending' });
        return { data: true, error: null };
      }
      if (name === 'replace_health_record_source') {
        const upload = state.uploads.get(payload.p_file_path);
        if (!upload || upload.status !== 'pending') return { data: null, error: { code: '40001', message: 'HEALTH_RECORD_SOURCE_UPLOAD_EXPIRED' } };
        const previousPath = state.record.file_path;
        if (state.record.file_path !== payload.p_expected_file_path || state.record.file_source_version !== payload.p_expected_source_version) {
          return { data: null, error: { code: '40001', message: 'HEALTH_RECORD_SOURCE_CHANGED' } };
        }
        state.record = { ...state.record, file_path: payload.p_file_path, file_mime_type: payload.p_mime_type, file_size: payload.p_file_size, file_source_version: state.record.file_source_version + 1 };
        const previousUpload = state.uploads.get(previousPath);
        if (previousUpload) { previousUpload.status = 'cancelled'; previousUpload.cancelled_at = new Date().toISOString(); }
        Object.assign(upload, { status: 'attached', expected_file_path: payload.p_file_path, expected_source_version: payload.p_expected_source_version + 1 });
        return { data: previousPath, error: null };
      }
      if (name === 'cancel_health_record_source_upload') {
        const upload = state.uploads.get(payload.p_staged_file_path);
        if (upload) upload.status = 'cancelled';
        if (!state.record) return { data: true, error: null };
        if (state.record.file_path === payload.p_staged_file_path) return { data: false, error: null };
        if (state.record.file_source_version > payload.p_expected_source_version) return { data: true, error: null };
        if (state.record.file_source_version === payload.p_expected_source_version && state.record.file_path === payload.p_expected_file_path) {
          state.record = { ...state.record, file_source_version: state.record.file_source_version + 1 };
          return { data: true, error: null };
        }
        return { data: false, error: null };
      }
      if (name === 'finish_health_record_source_uploads') {
        for (const filePath of payload.p_file_paths) state.uploads.delete(filePath);
        return { data: payload.p_file_paths.length, error: null };
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

test('maps the staged-upload quota to a safe retryable rate-limit response', () => {
  const error = mapHealthRecordError({ code: '54000', message: 'HEALTH_RECORD_SOURCE_UPLOAD_LIMIT' });
  assert.equal(error.status, 429);
  assert.equal(error.code, 'HEALTH_RECORD_SOURCE_UPLOAD_LIMIT');
  assert.doesNotMatch(error.message, /HEALTH_RECORD_SOURCE_UPLOAD_LIMIT/);
});

test('uploads only to a server-derived owner path and attaches validated metadata', async () => {
  const calls = [];
  const storageClient = { storage: { from(bucket) {
    assert.equal(bucket, BUCKET);
    return {
      async upload(path, bytes, options) { calls.push({ path, bytes, options }); return { error: null }; },
      async remove(paths) { calls.push({ removed: paths }); return { data: paths.map(name => ({ name })), error: null }; },
    };
  } } };
  const db = createDb();
  const originalRpc = db.rpc;
  db.rpc = async (name, payload) => { calls.push({ rpc: name, payload }); return originalRpc(name, payload); };
  const repository = createHealthRecordRepository({ storageClient });
  const saved = await repository.uploadSource({ db, userId: 'account-1', recordId: record.id, bytes: Buffer.from([0xff, 0xd8, 0xff, 1, 2, 3, 4, 5]), mimeType: 'image/jpeg' });
  const uploadCall = calls.find(call => call.path);
  const attachCall = calls.find(call => call.rpc === 'replace_health_record_source');
  assert.match(uploadCall.path, new RegExp(`^account-1/${record.id}/[0-9a-f-]{36}$`));
  assert.equal(uploadCall.options.upsert, false);
  assert.equal(calls.findIndex(call => call.rpc === 'begin_health_record_source_upload') < calls.findIndex(call => call.path), true);
  assert.deepEqual(attachCall.payload, {
    p_record_id: record.id, p_expected_file_path: null, p_expected_source_version: 0,
    p_file_path: uploadCall.path,
    p_mime_type: 'image/jpeg', p_file_size: 8,
  });
  assert.equal(saved.id, record.id);
  assert.equal(saved.source.available, true);
});

test('queues a fenced private source for delayed cleanup when metadata cannot be attached', async () => {
  const calls = [];
  const db = createDb();
  const originalRpc = db.rpc;
  db.rpc = async (name, payload) => {
    if (name === 'replace_health_record_source') return { data: null, error: { code: '42501', message: 'consent withdrawn' } };
    return originalRpc(name, payload);
  };
  const storageClient = { storage: { from: () => ({
    async upload() { return { error: null }; },
    async remove(paths) { calls.push(paths); return { error: new Error('storage unavailable') }; },
  }) } };
  const repository = createHealthRecordRepository({ storageClient });
  await assert.rejects(repository.uploadSource({
    db, userId: 'account-1', recordId: record.id,
    bytes: Buffer.from([0xff, 0xd8, 0xff, 1, 2, 3, 4, 5]), mimeType: 'image/jpeg',
  }), error => error.code === 'HEALTH_RECORD_FORBIDDEN' && error.status === 403);
  assert.equal(calls.length, 0, 'cleanup is deferred so an uncertain Storage request cannot recreate an untracked object');
  assert.equal(db.state.uploads.size, 1);
  assert.equal([...db.state.uploads.values()].some(upload => upload.status === 'cancelled'), true);
});

test('removes a staged object when Storage reports an uncertain upload failure', async () => {
  const objects = new Set();
  let rpcCalls = 0;
  const db = createDb();
  const originalRpc = db.rpc;
  db.rpc = async (...args) => { rpcCalls += 1; return originalRpc(...args); };
  const storageClient = { storage: { from: () => ({
    async upload(path) { objects.add(path); return { error: new Error('response lost after upload') }; },
    async remove(paths) { for (const path of paths) objects.delete(path); return { data: paths.map(name => ({ name })), error: null }; },
  }) } };
  const repository = createHealthRecordRepository({ storageClient });

  await assert.rejects(repository.uploadSource({
    db, userId: 'account-1', recordId: record.id,
    bytes: Buffer.from([0xff, 0xd8, 0xff, 1, 2, 3, 4, 5]), mimeType: 'image/jpeg',
  }), error => error.code === 'HEALTH_RECORD_UPLOAD_FAILED' && error.status === 503);

  assert.equal(objects.size, 1, 'the ambiguous object stays private until delayed cleanup verifies it');
  assert.equal(rpcCalls, 2, 'registration and cancellation are recorded before cleanup');
  assert.equal([...db.state.uploads.values()].some(upload => upload.status === 'cancelled'), true);
});

test('preserves the existing linked source when replacement attachment fails', async () => {
  const path = `account-1/${record.id}`;
  const oldBytes = Buffer.from([0xff, 0xd8, 0xff, 0x01, 0x02, 0x03, 0x04, 0x05]);
  const newBytes = Buffer.from([0xff, 0xd8, 0xff, 0x06, 0x07, 0x08, 0x09, 0x0a]);
  const storageObjects = new Map([[path, Buffer.from(oldBytes)]]);
  const existingRecord = { ...record, file_path: path, file_mime_type: 'image/jpeg', file_size: oldBytes.length };
  const db = createDb({ currentRecord: existingRecord });
  const originalRpc = db.rpc;
  db.rpc = async (name, payload) => {
    if (name === 'replace_health_record_source') return { data: null, error: { code: '42501', message: 'consent withdrawn' } };
    return originalRpc(name, payload);
  };
  const storageClient = { storage: { from: () => ({
    async upload(objectPath, bytes, options) {
      if (storageObjects.has(objectPath) && options.upsert !== true) return { error: new Error('object already exists') };
      storageObjects.set(objectPath, Buffer.from(bytes));
      return { error: null };
    },
    async remove(paths) {
      for (const objectPath of paths) storageObjects.delete(objectPath);
      return { error: null };
    },
  }) } };
  const repository = createHealthRecordRepository({ storageClient });

  await assert.rejects(repository.uploadSource({
    db, userId: 'account-1', recordId: record.id, bytes: newBytes, mimeType: 'image/jpeg',
  }));

  assert.deepEqual(storageObjects.get(path), oldBytes);
  assert.equal(storageObjects.size, 2, 'the unlinked private object remains tracked for delayed cleanup');
  assert.equal([...db.state.uploads.values()].some(upload => upload.status === 'cancelled'), true);
});

test('fences and tracks a staged source when the ambiguous attachment did not commit', async () => {
  const oldPath = `account-1/${record.id}`;
  const oldBytes = Buffer.from([0xff, 0xd8, 0xff, 0x01, 0x02, 0x03, 0x04, 0x05]);
  const storageObjects = new Map([[oldPath, oldBytes]]);
  const db = createDb({ currentRecord: { ...record, file_path: oldPath, file_mime_type: 'image/jpeg', file_size: oldBytes.length } });
  const originalRpc = db.rpc;
  db.rpc = async (name, payload) => {
    if (name === 'replace_health_record_source') throw Object.assign(new Error('connection reset after request was sent'), { code: 'EPIPE' });
    return originalRpc(name, payload);
  };
  const storageClient = { storage: { from: () => ({
    async upload(path, bytes) { storageObjects.set(path, Buffer.from(bytes)); return { error: null }; },
    async remove(paths) { for (const path of paths) storageObjects.delete(path); return { data: paths.map(name => ({ name })), error: null }; },
  }) } };
  const repository = createHealthRecordRepository({ storageClient });

  await assert.rejects(repository.uploadSource({
    db, userId: 'account-1', recordId: record.id,
    bytes: Buffer.from([0xff, 0xd8, 0xff, 0x06, 0x07, 0x08, 0x09, 0x0a]), mimeType: 'image/jpeg',
  }), error => error.code === 'HEALTH_RECORD_SOURCE_ATTACH_FAILED' && error.status === 503);

  assert.deepEqual(storageObjects.get(oldPath), oldBytes);
  assert.equal(storageObjects.size, 2, 'the new object stays tracked until delayed cleanup');
  assert.equal([...db.state.uploads.values()].some(upload => upload.status === 'cancelled'), true);
  assert.equal(db.state.record.file_source_version, 1);
});

test('reconciles a committed attachment when the RPC response is lost', async () => {
  const oldPath = `account-1/${record.id}`;
  const oldBytes = Buffer.from([0xff, 0xd8, 0xff, 0x01, 0x02, 0x03, 0x04, 0x05]);
  const storageObjects = new Map([[oldPath, oldBytes]]);
  const db = createDb({ currentRecord: { ...record, file_path: oldPath, file_mime_type: 'image/jpeg', file_size: oldBytes.length } });
  const originalRpc = db.rpc;
  db.rpc = async (name, payload) => {
    if (name !== 'replace_health_record_source') return originalRpc(name, payload);
    await originalRpc(name, payload);
    throw new Error('connection reset after database commit');
  };
  const storageClient = { storage: { from: () => ({
    async upload(path, bytes) { storageObjects.set(path, Buffer.from(bytes)); return { error: null }; },
    async remove(paths) { for (const path of paths) storageObjects.delete(path); return { data: paths.map(name => ({ name })), error: null }; },
  }) } };
  const repository = createHealthRecordRepository({ storageClient });

  const updated = await repository.uploadSource({
    db, userId: 'account-1', recordId: record.id,
    bytes: Buffer.from([0xff, 0xd8, 0xff, 0x06, 0x07, 0x08, 0x09, 0x0a]), mimeType: 'image/jpeg',
  });

  assert.equal(updated.source.available, true);
  assert.notEqual(db.state.record.file_path, oldPath);
  assert.equal(storageObjects.has(oldPath), false);
  assert.equal(storageObjects.has(db.state.record.file_path), true);
});

test('retries cleanup fencing after its own RPC response is lost', async () => {
  const oldPath = `account-1/${record.id}`;
  const oldBytes = Buffer.from([0xff, 0xd8, 0xff, 0x01, 0x02, 0x03, 0x04, 0x05]);
  const storageObjects = new Map([[oldPath, oldBytes]]);
  const db = createDb({ currentRecord: { ...record, file_path: oldPath, file_mime_type: 'image/jpeg', file_size: oldBytes.length } });
  const originalRpc = db.rpc;
  let cancellationCalls = 0;
  db.rpc = async (name, payload) => {
    if (name === 'replace_health_record_source') throw new Error('attach response lost');
    if (name === 'cancel_health_record_source_upload' && cancellationCalls++ === 0) {
      await originalRpc(name, payload);
      throw new Error('cancellation response lost');
    }
    return originalRpc(name, payload);
  };
  const storageClient = { storage: { from: () => ({
    async upload(path, bytes) { storageObjects.set(path, Buffer.from(bytes)); return { error: null }; },
    async remove(paths) { for (const path of paths) storageObjects.delete(path); return { data: paths.map(name => ({ name })), error: null }; },
  }) } };
  const repository = createHealthRecordRepository({ storageClient });

  await assert.rejects(repository.uploadSource({
    db, userId: 'account-1', recordId: record.id,
    bytes: Buffer.from([0xff, 0xd8, 0xff, 0x06, 0x07, 0x08, 0x09, 0x0a]), mimeType: 'image/jpeg',
  }), error => error.code === 'HEALTH_RECORD_SOURCE_ATTACH_FAILED' && error.status === 503);

  assert.equal(cancellationCalls, 2);
  assert.deepEqual(storageObjects.get(oldPath), oldBytes);
  assert.equal(storageObjects.size, 2, 'the fenced source stays tracked until delayed cleanup');
  assert.equal([...db.state.uploads.values()].some(upload => upload.status === 'cancelled'), true);
});

test('keeps an ambiguous staged source registered when every cancellation response is lost', async () => {
  const oldPath = `account-1/${record.id}`;
  const storageObjects = new Map([[oldPath, Buffer.from([0xff, 0xd8, 0xff, 1, 2, 3, 4, 5])]]);
  const db = createDb({ currentRecord: { ...record, file_path: oldPath, file_mime_type: 'image/jpeg', file_size: 8 } });
  const originalRpc = db.rpc;
  let cancellationCalls = 0;
  db.rpc = async (name, payload) => {
    if (name === 'replace_health_record_source') throw new Error('attach response lost');
    if (name === 'cancel_health_record_source_upload') {
      cancellationCalls += 1;
      throw new Error('cancellation response lost');
    }
    return originalRpc(name, payload);
  };
  const storageClient = { storage: { from: () => ({
    async upload(path, bytes) { storageObjects.set(path, Buffer.from(bytes)); return { error: null }; },
    async remove(paths) { for (const path of paths) storageObjects.delete(path); return { data: paths.map(name => ({ name })), error: null }; },
  }) } };
  const repository = createHealthRecordRepository({ storageClient });

  await assert.rejects(repository.uploadSource({
    db, userId: 'account-1', recordId: record.id,
    bytes: Buffer.from([0xff, 0xd8, 0xff, 6, 7, 8, 9, 10]), mimeType: 'image/jpeg',
  }), error => error.code === 'HEALTH_RECORD_SOURCE_ATTACH_UNCERTAIN' && error.status === 503);

  assert.equal(cancellationCalls, 2);
  assert.equal(db.state.uploads.size, 2, 'the path remains durable for the background cleanup worker');
  assert.equal([...db.state.uploads.values()].some(upload => upload.status === 'pending'), true);
  assert.equal(storageObjects.size, 2);
});

test('replaces a linked source only after the new object is attached, then removes the prior object', async () => {
  const oldPath = `account-1/${record.id}`;
  const oldBytes = Buffer.from([0xff, 0xd8, 0xff, 0x01, 0x02, 0x03, 0x04, 0x05]);
  const storageObjects = new Map([[oldPath, Buffer.from(oldBytes)]]);
  const db = createDb({ currentRecord: { ...record, file_path: oldPath, file_mime_type: 'image/jpeg', file_size: oldBytes.length } });
  const originalRpc = db.rpc;
  db.rpc = async (name, payload) => {
    if (name === 'replace_health_record_source') assert.equal(storageObjects.has(oldPath), true, 'the old object remains until metadata points at the new object');
    return originalRpc(name, payload);
  };
  const storageClient = { storage: { from: () => ({
    async upload(path, bytes) { storageObjects.set(path, Buffer.from(bytes)); return { error: null }; },
    async remove(paths) { for (const path of paths) storageObjects.delete(path); return { data: paths.map(name => ({ name })), error: null }; },
  }) } };
  const repository = createHealthRecordRepository({ storageClient });

  const updated = await repository.uploadSource({
    db, userId: 'account-1', recordId: record.id,
    bytes: Buffer.from([0xff, 0xd8, 0xff, 0x06, 0x07, 0x08, 0x09, 0x0a]), mimeType: 'image/jpeg',
  });

  assert.equal(updated.source.available, true);
  assert.match(db.state.record.file_path, new RegExp(`^account-1/${record.id}/[0-9a-f-]{36}$`));
  assert.equal(storageObjects.has(oldPath), false);
  assert.equal(storageObjects.has(db.state.record.file_path), true);
});

test('reports when a linked source was replaced but the prior object could not be removed', async () => {
  const oldPath = `account-1/${record.id}`;
  const oldBytes = Buffer.from([0xff, 0xd8, 0xff, 0x01, 0x02, 0x03, 0x04, 0x05]);
  const storageObjects = new Map([[oldPath, Buffer.from(oldBytes)]]);
  const db = createDb({ currentRecord: { ...record, file_path: oldPath, file_mime_type: 'image/jpeg', file_size: oldBytes.length } });
  const storageClient = { storage: { from: () => ({
    async upload(path, bytes) { storageObjects.set(path, Buffer.from(bytes)); return { error: null }; },
    async remove(paths) { assert.deepEqual(paths, [oldPath]); return { error: new Error('storage unavailable') }; },
  }) } };
  const repository = createHealthRecordRepository({ storageClient });

  await assert.rejects(repository.uploadSource({
    db, userId: 'account-1', recordId: record.id,
    bytes: Buffer.from([0xff, 0xd8, 0xff, 0x06, 0x07, 0x08, 0x09, 0x0a]), mimeType: 'image/jpeg',
  }), error => error.code === 'HEALTH_RECORD_PREVIOUS_SOURCE_CLEANUP_FAILED' && error.status === 503);

  assert.notEqual(db.state.record.file_path, oldPath);
  assert.equal(storageObjects.has(oldPath), true);
  assert.equal(storageObjects.has(db.state.record.file_path), true);
});

test('deletes owner-scoped metadata then removes every source object for the record', async () => {
  const calls = [];
  const existing = { ...record, file_path: `account-1/${record.id}`, file_mime_type: 'image/jpeg', file_size: 8 };
  const db = createDb({ currentRecord: existing });
  const storageClient = {
    async rpc(name, args) {
      calls.push({ rpc: name, args });
      if (name === 'delete_health_record') db.state.record = null;
      return { data: null, error: null };
    },
    storage: { from: () => ({
      async list(prefix) { calls.push({ list: prefix }); return { data: [], error: null }; },
      async remove(paths) { calls.push({ remove: paths }); return { data: paths.map(name => ({ name })), error: null }; },
    }) },
  };
  const repository = createHealthRecordRepository({ storageClient });
  assert.equal(await repository.delete({ db, userId: 'account-1', recordId: record.id }), true);
  assert.deepEqual(calls, [
    { rpc: 'delete_health_record', args: { p_record_id: record.id, p_user_id: 'account-1' } },
    { list: `account-1/${record.id}` },
    { remove: [`account-1/${record.id}`] },
    { rpc: 'finish_health_record_source_uploads', args: { p_file_paths: [`account-1/${record.id}`] } },
  ]);
});

test('deletes orphaned staged sources when retrying deletion for a removed record', async () => {
  const orphanPath = `account-1/${record.id}/44440000-0000-4000-8000-000000000001`;
  const calls = [];
  const db = createDb({ currentRecord: null });
  let orphanListed = true;
  const storageClient = { storage: { from: () => ({
    async list(prefix, options) {
      calls.push({ list: prefix, options });
      const data = orphanListed ? [{ id: 'object-1', name: orphanPath.split('/').at(-1), metadata: { mimetype: 'image/jpeg' } }] : [];
      return { data, error: null };
    },
    async remove(paths) { calls.push({ remove: paths }); orphanListed = false; return { data: paths.map(name => ({ name })), error: null }; },
  }) } };
  const repository = createHealthRecordRepository({ storageClient });

  assert.equal(await repository.delete({ db, userId: 'account-1', recordId: record.id }), true);
  assert.ok(calls.some(call => call.remove?.includes(orphanPath)));
  assert.deepEqual(calls.at(-1), { remove: [`account-1/${record.id}`] });
});

test('recursively removes legacy nested images under the exact deleted record prefix', async () => {
  const root = `account-1/${record.id}`;
  const nestedPath = `${root}/legacy/subfolder/old-image.bin`;
  const objects = new Set([nestedPath]);
  const calls = [];
  const db = createDb({ currentRecord: null });
  const storageClient = {
    async rpc(name, args) { calls.push({ rpc: name, args }); return { data: 1, error: null }; },
    storage: { from: () => ({
      async list(folder, options) {
        calls.push({ list: folder, options });
        if (!objects.has(nestedPath) || !nestedPath.startsWith(`${folder}/`)) return { data: [], error: null };
        const relativePath = nestedPath.slice(folder.length + 1);
        const [name, ...remaining] = relativePath.split('/');
        return { data: [remaining.length
          ? { id: null, name, metadata: null }
          : { id: 'legacy-object', name, metadata: { mimetype: 'application/octet-stream' } }], error: null };
      },
      async remove(paths) {
        calls.push({ remove: paths });
        for (const filePath of paths) objects.delete(filePath);
        return { data: paths.filter(filePath => filePath !== root).map(name => ({ name })), error: null };
      },
    }) },
  };
  const repository = createHealthRecordRepository({ storageClient });

  assert.equal(await repository.delete({ db, userId: 'account-1', recordId: record.id }), true);
  assert.equal(objects.size, 0);
  assert.equal(calls.some(call => call.remove?.includes(nestedPath)), true);
});

test('record deletion walks many legacy folders one at a time without buffering all folder names', async () => {
  const root = `account-1/${record.id}`;
  const folders = Array.from({ length: 101 }, (_, index) => `legacy-${index}`);
  const calls = [];
  const db = createDb({ currentRecord: null });
  const storageClient = {
    async rpc(name, args) { calls.push({ rpc: name, args }); return { data: 1, error: null }; },
    storage: { from: () => ({
      async list(folder, options) {
        calls.push({ list: folder, options });
        if (folder !== root) return { data: [], error: null };
        return { data: folders.slice(options.offset, options.offset + options.limit).map(name => ({ id: null, name, metadata: null })), error: null };
      },
      async remove(paths) {
        calls.push({ remove: paths });
        for (const path of paths) {
          const name = path.slice(root.length + 1);
          const index = folders.indexOf(name);
          if (index >= 0) folders.splice(index, 1);
        }
        return { data: paths.filter(path => path !== root).map(name => ({ name })), error: null };
      },
    }) },
  };
  const repository = createHealthRecordRepository({ storageClient });

  assert.equal(await repository.delete({ db, userId: 'account-1', recordId: record.id }), true);
  assert.equal(folders.length, 0);
  assert.equal(calls.some(call => call.list === root && call.options.offset > 0), false);
  assert.equal(calls.filter(call => call.remove?.some(path => path.startsWith(`${root}/legacy-`))).length, 101);
});

test('keeps source objects when deleting the database record is rejected', async () => {
  const calls = [];
  const existing = { ...record, file_path: `account-1/${record.id}`, file_mime_type: 'image/jpeg', file_size: 8 };
  const db = createDb({ currentRecord: existing });
  const storageClient = {
    async rpc() { return { data: null, error: { code: '42501', message: 'record deletion rejected' } }; },
    storage: { from: () => ({
      async list() { calls.push('list'); return { data: [], error: null }; },
      async remove(paths) { calls.push(paths); return { data: [], error: null }; },
    }) },
  };
  const repository = createHealthRecordRepository({ storageClient });

  await assert.rejects(repository.delete({ db, userId: 'account-1', recordId: record.id }), error => error.code === 'HEALTH_RECORD_FORBIDDEN');
  assert.equal(calls.length, 0);
  assert.equal(db.state.record.file_path, existing.file_path);
});
