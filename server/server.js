const express = require('express');
const { loadCatalog } = require('./src/repositories/catalog');
const { createDemoContext } = require('./src/demo-context');
const { createApiRouter } = require('./src/routes/api');
const { readServerConfig } = require('./src/config/server-config');
const { registerGracefulShutdown } = require('./src/services/server-shutdown');

const app = express();
let config;
try { config = readServerConfig(process.env); }
catch (error) { console.error(error.message); process.exit(1); }

let catalog;
try { catalog = loadCatalog(); }
catch (error) { console.error(error.message); process.exit(1); }

app.use(express.json({ limit: '32kb' }));
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', config.corsOrigin);
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Demo-Namespace, Idempotency-Key');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  return next();
});
app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'nutrition-assistant-api' }));
const demoContext = createDemoContext({
  env: { ...process.env, DEMO_DATA_ENABLED: String(config.demoDataEnabled) },
});
app.use('/api/v1', createApiRouter(catalog, demoContext));
app.use((err, req, res, _next) => {
  const isMealEntryRequest = req.path.startsWith('/api/v1/meal-entries');
  const isShoppingListRequest = req.path.startsWith('/api/v1/shopping-lists');
  console.error('API request failed', { method: req.method, path: req.path, type: err?.type || 'UNHANDLED_ERROR' });
  if ((isMealEntryRequest || isShoppingListRequest) && ['entity.parse.failed', 'entity.too.large'].includes(err?.type)) {
    return res.status(400).json({ error: 'Nội dung JSON không hợp lệ hoặc quá lớn.', code: 'VALIDATION_ERROR' });
  }
  return res.status(500).json({ error: 'Lỗi nội bộ.' });
});
const server = app.listen(config.port, '0.0.0.0', () => console.log(`Nutrition API listening on ${config.port}`));
registerGracefulShutdown(server);
