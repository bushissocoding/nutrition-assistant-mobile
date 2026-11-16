const express = require('express');
const { loadCatalog } = require('./src/repositories/catalog');
const { createDemoContext } = require('./src/demo-context');
const { createApiRouter } = require('./src/routes/api');

const app = express();
const port = Number(process.env.PORT || 4000);
let catalog;
try { catalog = loadCatalog(); }
catch (error) { console.error(error.message); process.exit(1); }

app.use(express.json({ limit: '32kb' }));
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', process.env.CORS_ORIGIN || '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-Demo-Namespace');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  return next();
});
app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'nutrition-assistant-api' }));
const demoContext = createDemoContext({ env: process.env });
app.use('/api/v1', createApiRouter(catalog, demoContext));
app.use((err, _req, res, _next) => { console.error(err); res.status(500).json({ error: 'Lỗi nội bộ.' }); });
app.listen(port, '0.0.0.0', () => console.log(`Nutrition API listening on ${port}`));
