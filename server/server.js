const express = require('express');
const { loadCatalog } = require('./src/repositories/catalog');
const { createApiRouter } = require('./src/routes/api');

const app = express();
const port = Number(process.env.PORT || 4000);
let catalog;
try { catalog = loadCatalog(); }
catch (error) { console.error(error.message); process.exit(1); }

app.use(express.json({ limit: '32kb' }));
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  return next();
});
app.use((error, _req, res, _next) => {
  if (error instanceof SyntaxError && Object.hasOwn(error, 'body')) {
    return res.status(400).json({ error: { code: 'INVALID_JSON', message: 'Nội dung yêu cầu phải là JSON hợp lệ.', field: 'body' } });
  }
  console.error(error);
  return res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Lỗi nội bộ.', field: null } });
});
app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'nutrition-assistant-api' }));
app.use('/api/v1', createApiRouter(catalog));
app.use((_req, res) => res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Không tìm thấy tài nguyên.', field: null } }));
app.listen(port, '0.0.0.0', () => console.log(`Nutrition API listening on ${port}`));
