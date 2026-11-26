const express = require('express');
const { loadCatalog } = require('./src/repositories/catalog');
const { createDemoContext } = require('./src/demo-context');
const { createApiRouter } = require('./src/routes/api');
const { readServerConfig } = require('./src/config/server-config');
const { registerGracefulShutdown } = require('./src/services/server-shutdown');
const { createCorsMiddleware } = require('./src/middleware/cors');
const { createSecurityHeadersMiddleware } = require('./src/middleware/security-headers');
const { createRateLimitMiddleware } = require('./src/middleware/rate-limit');
const { createRequestTelemetryMiddleware, logApiFailure } = require('./src/observability/request-telemetry');
const { createSupabaseAuthMiddleware } = require('./src/middleware/supabase-auth');
const { createPrivilegedSupabaseClient } = require('./src/services/supabase/privileged-client');
const { createAccountDeletionService } = require('./src/services/account-lifecycle');
const { createFdcFoodSource } = require('./src/services/fdc-food-source');
const { createPayosGateway } = require('./src/services/payos-gateway');
const { createPaymentRepository } = require('./src/repositories/payment-repository');
const { createChatRepository } = require('./src/repositories/chat-repository');
const { createAssistantProvider } = require('./src/services/assistant-provider');
const { createHealthRecordRepository } = require('./src/repositories/health-record-repository');
const { createNotificationRepository } = require('./src/repositories/notification-repository');
const { createPersonalizationRepository } = require('./src/repositories/personalization-repository');

const app = express();
app.disable('x-powered-by');
let config;
try { config = readServerConfig(process.env); }
catch (error) { console.error(JSON.stringify({ event: 'api_startup_failed', entryPoint: 'http_api', code: error.code || 'INVALID_SERVER_CONFIG', message: error.message })); process.exit(1); }

let catalog;
try { catalog = loadCatalog(); }
catch (error) { console.error(JSON.stringify({ event: 'api_startup_failed', entryPoint: 'http_api', code: error.code || 'CATALOG_UNAVAILABLE' })); process.exit(1); }

app.use(createRequestTelemetryMiddleware());
app.use(createSecurityHeadersMiddleware({ environment: config.environment }));
app.use(createCorsMiddleware(config));
app.use(createRateLimitMiddleware());
app.use(express.json({ limit: '32kb' }));
app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'nutrition-assistant-api' }));
const demoContext = createDemoContext({
  env: { ...process.env, DEMO_DATA_ENABLED: String(config.demoDataEnabled) },
});
const authMiddleware = createSupabaseAuthMiddleware({ settings: config.supabase });
const foodSource = createFdcFoodSource({ apiKey: config.fdcApiKey });
let deleteAccount;
let paymentRepository;
let chatRepository;
let healthRecordRepository;
let notificationRepository;
let personalizationRepository;
if (config.supabase) {
  const privilegedClient = createPrivilegedSupabaseClient({ settings: config.supabase });
  deleteAccount = createAccountDeletionService({ adminClient: privilegedClient });
  paymentRepository = createPaymentRepository({ privilegedClient });
  chatRepository = createChatRepository();
  healthRecordRepository = createHealthRecordRepository({ storageClient: privilegedClient });
  notificationRepository = createNotificationRepository();
  personalizationRepository = createPersonalizationRepository();
}
const payosGateway = createPayosGateway({ config: config.payos });
const assistantProvider = createAssistantProvider({ config: config.assistant });
app.use('/api/v1', createApiRouter(catalog, demoContext, { authMiddleware, deleteAccount, foodSource, paymentRepository, payosGateway, payosConfig: config.payos, chatRepository, assistantProvider, healthRecordRepository, notificationRepository, personalizationRepository }));
app.use((err, req, res, _next) => {
  const isMealEntryRequest = req.path.startsWith('/api/v1/meal-entries');
  const isShoppingListRequest = req.path.startsWith('/api/v1/shopping-lists');
  const isPayosWebhookRequest = req.path === '/api/v1/webhooks/payos';
  logApiFailure(req, 'api_request_failed', err?.type || 'UNHANDLED_ERROR');
  if (['entity.parse.failed', 'entity.too.large'].includes(err?.type)) {
    const status = err.type === 'entity.too.large' ? 413 : 400;
    const error = status === 413 ? 'Nội dung yêu cầu vượt quá giới hạn.' : 'Nội dung JSON không hợp lệ.';
    if (isMealEntryRequest || isShoppingListRequest || req.path.startsWith('/api/v1/me/') || isPayosWebhookRequest) {
      return res.status(status).json({ error, code: status === 413 ? 'PAYLOAD_TOO_LARGE' : 'VALIDATION_ERROR' });
    }
  }
  return res.status(500).json({ error: 'Lỗi nội bộ.' });
});
const server = app.listen(config.port, config.bindAddress, () => console.log(JSON.stringify({ event: 'api_listening', entryPoint: 'http_api', port: config.port })));
registerGracefulShutdown(server);
