const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const test = require('node:test');
const { createDemoContext } = require('../src/demo-context');

test('builds the demo store and scope middleware from the provided environment', async t => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'nutrition-demo-context-'));
  t.after(() => fs.rm(directory, { recursive: true, force: true }));
  const filePath = path.join(directory, 'configured-store.json');
  const context = createDemoContext({
    env: { NODE_ENV: 'development', DEMO_DATA_ENABLED: 'true', DEMO_DATA_FILE: filePath },
  });

  assert.equal(typeof context.requireScope, 'function');
  await context.store.writeCollection('demo-client-1', 'diary', [{ id: 'meal-1' }]);
  const saved = JSON.parse(await fs.readFile(filePath, 'utf8'));
  assert.deepEqual(saved.namespaces['demo-client-1'].diary, [{ id: 'meal-1' }]);
});
