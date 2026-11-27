const assert = require('node:assert/strict');
const test = require('node:test');
const { createHealthRecordSourceCleanupWorker } = require('../src/services/health-record-source-cleanup');

test('removes deduplicated stale private images before clearing their durable cleanup rows', async () => {
  const calls = [];
  const adminClient = {
    async rpc(name, payload) {
      calls.push({ rpc: name, payload });
      if (name === 'claim_stale_health_record_source_uploads') return {
        data: [{ file_path: 'user/record/one' }, { file_path: 'user/record/one' }, { file_path: 'user/record/two' }], error: null,
      };
      return { data: 2, error: null };
    },
    storage: { from: bucket => {
      assert.equal(bucket, 'health-record-images');
      return { async remove(paths) { calls.push({ remove: paths }); return { data: paths.map(name => ({ name })), error: null }; } };
    } },
  };
  const worker = createHealthRecordSourceCleanupWorker({ adminClient });

  assert.equal(await worker.runOnce(), 2);
  assert.equal(calls[0].rpc, 'claim_stale_health_record_source_uploads');
  assert.deepEqual(calls[1].remove, ['user/record/one', 'user/record/two']);
  assert.deepEqual(calls[2], { rpc: 'finish_health_record_source_uploads', payload: { p_file_paths: ['user/record/one', 'user/record/two'] } });
});

test('retains cleanup rows when Storage removal response is ambiguous', async () => {
  const calls = [];
  const adminClient = {
    async rpc(name, payload) {
      calls.push({ rpc: name, payload });
      return name === 'claim_stale_health_record_source_uploads'
        ? { data: [{ file_path: 'user/record/staged' }], error: null }
        : { data: null, error: null };
    },
    storage: { from: () => ({ async remove() { return { data: null, error: null }; } }) },
  };
  const worker = createHealthRecordSourceCleanupWorker({ adminClient });

  await assert.rejects(worker.runOnce(), /cleanup removal failed/);
  assert.equal(calls.filter(call => call.rpc === 'finish_health_record_source_uploads').length, 0);
});

test('coalesces overlapping cleanup runs into one claim and removal', async () => {
  let releaseClaim;
  let claimCalls = 0;
  let removeCalls = 0;
  const adminClient = {
    async rpc(name) {
      if (name === 'claim_stale_health_record_source_uploads') {
        claimCalls += 1;
        return new Promise(resolve => { releaseClaim = resolve; });
      }
      return { data: 1, error: null };
    },
    storage: { from: () => ({ async remove(paths) { removeCalls += 1; return { data: paths.map(name => ({ name })), error: null }; } }) },
  };
  const worker = createHealthRecordSourceCleanupWorker({ adminClient });
  const first = worker.runOnce();
  const second = worker.runOnce();
  await new Promise(resolve => setImmediate(resolve));
  releaseClaim({ data: [{ file_path: 'user/record/staged' }], error: null });

  assert.deepEqual(await Promise.all([first, second]), [1, 1]);
  assert.equal(claimCalls, 1);
  assert.equal(removeCalls, 1);
});
