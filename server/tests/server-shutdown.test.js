const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { registerGracefulShutdown } = require('../src/services/server-shutdown');

function createHarness(closeImplementation) {
  const processObject = new EventEmitter();
  const logs = [];
  const server = {
    close: closeImplementation,
    closeAllConnections() { logs.push('force-close'); },
  };
  const logger = {
    log(...args) { logs.push(args); },
    error(...args) { logs.push(args); },
  };

  return { processObject, server, logger, logs };
}

test('handles SIGINT and SIGTERM once and clears the deadline after graceful close', async () => {
  let closeCalls = 0;
  let finishClose;
  const harness = createHarness(callback => {
    closeCalls += 1;
    finishClose = callback;
  });
  registerGracefulShutdown(harness.server, {
    processObject: harness.processObject,
    logger: harness.logger,
    timeoutMs: 20,
  });

  harness.processObject.emit('SIGINT');
  harness.processObject.emit('SIGTERM');
  assert.equal(closeCalls, 1);

  finishClose();
  await new Promise(resolve => setTimeout(resolve, 30));

  assert.equal(harness.logs.filter(item => item === 'force-close').length, 0);
  assert.ok(harness.logs.some(item => Array.isArray(item) && item[0] === 'API server stopped.'));
  assert.equal(harness.processObject.exitCode, undefined);
});

test('force-closes remaining connections after the shutdown deadline', async () => {
  let finishClose;
  const harness = createHarness(callback => { finishClose = callback; });
  harness.server.closeAllConnections = () => {
    harness.logs.push('force-close');
    finishClose();
  };
  registerGracefulShutdown(harness.server, {
    processObject: harness.processObject,
    logger: harness.logger,
    timeoutMs: 10,
  });

  harness.processObject.emit('SIGTERM');
  await new Promise(resolve => setTimeout(resolve, 20));

  assert.equal(harness.logs.filter(item => item === 'force-close').length, 1);
  assert.ok(harness.logs.some(item => Array.isArray(item) && item[0] === 'API server stopped.'));
});

test('reports close errors without exposing their messages and sets a failing exit code', () => {
  const harness = createHarness(callback => callback(Object.assign(new Error('sensitive detail'), { code: 'EIO' })));
  registerGracefulShutdown(harness.server, {
    processObject: harness.processObject,
    logger: harness.logger,
    timeoutMs: 20,
  });

  harness.processObject.emit('SIGINT');

  assert.equal(harness.processObject.exitCode, 1);
  assert.ok(harness.logs.some(item => Array.isArray(item) && item[1]?.code === 'EIO'));
  assert.equal(JSON.stringify(harness.logs).includes('sensitive detail'), false);
});
