const express = require('express');
const { loadCatalog } = require('./src/repositories/catalog');
const { createDemoContext } = require('./src/demo-context');
const { createApiRouter } = require('./src/routes/api');
const { readServerConfig } = require('./src/config/server-config');
const { registerGracefulShutdown } = require('./src/services/server-shutdown');
const { createCorsMiddleware } = require('./src/middleware/cors');
const { createSecurityHeadersMiddleware } = require('./src/middleware/security-headers');
const { createRateLimitMiddleware } = require('./src/middleware/rate-limit');
const { createSupabaseAuthMiddleware } = require('./src/middleware/supabase-auth');
const { createPrivilegedSupabaseClient } = require('./src/services/supabase/privileged-client');
const { createAccountDeletionService } = require('./src/services/account-lifecycle');

const app = express();
app.disable('x-powered-by');
let config;
try { config = readServerConfig(process.env); }
catch (error) { console.error(error.message); process.exit(1); }

let catalog;
try { catalog = loadCatalog(); }
catch (error) { console.error(error.message); process.exit(1); }

app.use(createSecurityHeadersMiddleware({ environment: config.environment }));
app.use(createCorsMiddleware(config));
app.use(createRateLimitMiddleware());
app.use(express.json({ limit: '32kb' }));
app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'nutrition-assistant-api' }));
const demoContext = createDemoContext({
  env: { ...process.env, DEMO_DATA_ENABLED: String(config.demoDataEnabled) },
});
const authMiddleware = createSupabaseAuthMiddleware({ settings: config.supabase });
let deleteAccount;
if (config.supabase) {
  const privilegedClient = createPrivilegedSupabaseClient({ settings: config.supabase });
  deleteAccount = createAccountDeletionService({ adminClient: privilegedClient });
}
app.use('/api/v1', createApiRouter(catalog, demoContext, { authMiddleware, deleteAccount }));
app.use((err, req, res, _next) => {
  const isMealEntryRequest = req.path.startsWith('/api/v1/meal-entries');
  const isShoppingListRequest = req.path.startsWith('/api/v1/shopping-lists');
  console.error('API request failed', { method: req.method, path: req.path, type: err?.type || 'UNHANDLED_ERROR' });
  if ((isMealEntryRequest || isShoppingListRequest || req.path.startsWith('/api/v1/me/')) && ['entity.parse.failed', 'entity.too.large'].includes(err?.type)) {
    return res.status(400).json({ error: 'Nội dung JSON không hợp lệ hoặc quá lớn.', code: 'VALIDATION_ERROR' });
  }
  return res.status(500).json({ error: 'Lỗi nội bộ.' });
});
const server = app.listen(config.port, '0.0.0.0', () => console.log(`Nutrition API listening on ${config.port}`));
registerGracefulShutdown(server);
