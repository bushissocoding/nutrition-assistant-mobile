'use strict';

const BUCKET = 'health-record-images';
const CLEANUP_BATCH_SIZE = 100;

function createHealthRecordSourceCleanupWorker({
  adminClient,
  intervalMs = 60_000,
  minAgeSeconds = 300,
  batchSize = CLEANUP_BATCH_SIZE,
  onError = () => {},
} = {}) {
  if (!Number.isSafeInteger(intervalMs) || intervalMs < 1000
    || !Number.isSafeInteger(minAgeSeconds) || minAgeSeconds < 60
    || !Number.isSafeInteger(batchSize) || batchSize < 1 || batchSize > CLEANUP_BATCH_SIZE
    || typeof onError !== 'function') {
    throw new TypeError('Health record source cleanup worker configuration is invalid.');
  }

  let timer = null;
  let inFlight = null;

  async function runOnce() {
    if (inFlight) return inFlight;
    inFlight = (async () => {
      if (typeof adminClient?.rpc !== 'function' || typeof adminClient?.storage?.from !== 'function') {
        throw new Error('Health record source cleanup is unavailable.');
      }
      const { data, error } = await adminClient.rpc('claim_stale_health_record_source_uploads', {
        p_min_age_seconds: minAgeSeconds,
        p_limit: batchSize,
      });
      if (error || !Array.isArray(data)) throw new Error('Health record source cleanup claim failed.');
      const paths = [...new Set(data.map(row => row?.file_path).filter(path => typeof path === 'string' && path.length > 0))];
      const bucket = adminClient.storage.from(BUCKET);
      for (let index = 0; index < paths.length; index += batchSize) {
        const batch = paths.slice(index, index + batchSize);
        const { data: removed, error: removeError } = await bucket.remove(batch);
        if (removeError || !Array.isArray(removed)) throw new Error('Health record source cleanup removal failed.');
        const { error: finishError } = await adminClient.rpc('finish_health_record_source_uploads', { p_file_paths: batch });
        if (finishError) throw new Error('Health record source cleanup completion failed.');
      }
      return paths.length;
    })();
    try {
      return await inFlight;
    } finally {
      inFlight = null;
    }
  }

  function start() {
    if (timer) return () => stop();
    const runSafely = () => { void runOnce().catch(onError); };
    timer = setInterval(runSafely, intervalMs);
    timer.unref?.();
    runSafely();
    return () => stop();
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  return { runOnce, start, stop };
}

module.exports = { BUCKET, CLEANUP_BATCH_SIZE, createHealthRecordSourceCleanupWorker };
