'use strict';

const { readServerConfig } = require('./src/config/server-config');
const { createPrivilegedSupabaseClient } = require('./src/services/supabase/privileged-client');
const { createExpoPushGateway } = require('./src/services/expo-push-gateway');
const { createPushWorkerRepository } = require('./src/repositories/push-worker-repository');
const { createPushWorker } = require('./src/services/push-worker');

let config;
try { config = readServerConfig(process.env); }
catch (error) { console.error(JSON.stringify({ event: 'push_worker_startup_failed', entryPoint: 'push_worker', code: error.code || 'INVALID_SERVER_CONFIG', message: error.message })); process.exit(1); }
if (!config.supabase || !config.expoPush) {
  console.error(JSON.stringify({ event: 'push_worker_startup_failed', entryPoint: 'push_worker', code: 'PUSH_WORKER_CONFIG_REQUIRED' }));
  process.exit(1);
}

const client = createPrivilegedSupabaseClient({ settings: config.supabase });
const worker = createPushWorker({
  repository: createPushWorkerRepository({ privilegedClient: client }),
  gateway: createExpoPushGateway({ config: config.expoPush }),
});
let stopped = false;
let timer;

async function tick() {
  if (stopped) return;
  try {
    const result = await worker.runOnce();
    if (result.claimed || result.receiptsChecked) console.log(JSON.stringify({ event: 'push_worker_batch_completed', entryPoint: 'push_worker', ...result }));
  } catch {
    console.error(JSON.stringify({ event: 'push_worker_batch_failed', entryPoint: 'push_worker', code: 'PUSH_WORKER_BATCH_FAILED' }));
  }
  if (!stopped) timer = setTimeout(tick, 15000);
}

function stop() {
  stopped = true;
  clearTimeout(timer);
}
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
tick();
