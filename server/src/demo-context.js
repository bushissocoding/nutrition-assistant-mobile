const { createDemoScopeMiddleware } = require('./middleware/demo-scope');
const { createDemoStore } = require('./repositories/demo-store');

function createDemoContext({ env = process.env } = {}) {
  const storeOptions = env.DEMO_DATA_FILE ? { filePath: env.DEMO_DATA_FILE } : {};
  return {
    store: createDemoStore(storeOptions),
    requireScope: createDemoScopeMiddleware({ env }),
  };
}

module.exports = { createDemoContext };
