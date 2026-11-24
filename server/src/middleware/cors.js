const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];
const BASE_HEADERS = ['content-type', 'authorization', 'idempotency-key'];

function createCorsMiddleware({ corsOrigins = ['*'], demoDataEnabled = false, environment = 'development' } = {}) {
  const allowedOrigins = new Set(corsOrigins);
  const allowedHeaders = new Set(BASE_HEADERS);
  if (demoDataEnabled && environment !== 'production') allowedHeaders.add('x-demo-namespace');

  return function applyCors(req, res, next) {
    const origin = req.get('Origin');
    const wildcard = allowedOrigins.has('*');
    if (origin && !wildcard && !allowedOrigins.has(origin)) {
      return res.status(403).json({ error: 'Nguồn truy cập không được cho phép.', code: 'CORS_REQUEST_DENIED' });
    }

    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', wildcard ? '*' : origin);
      if (!wildcard) res.setHeader('Vary', 'Origin');
    }

    if (req.method !== 'OPTIONS') return next();

    const requestedMethod = req.get('Access-Control-Request-Method');
    if (requestedMethod && !METHODS.includes(requestedMethod.toUpperCase())) {
      return res.status(403).json({ error: 'Phương thức truy cập không được cho phép.', code: 'CORS_REQUEST_DENIED' });
    }
    const requestedHeaders = String(req.get('Access-Control-Request-Headers') || '')
      .split(',')
      .map(header => header.trim().toLowerCase())
      .filter(Boolean);
    if (requestedHeaders.some(header => !allowedHeaders.has(header))) {
      return res.status(403).json({ error: 'Header truy cập không được cho phép.', code: 'CORS_REQUEST_DENIED' });
    }

    res.setHeader('Access-Control-Allow-Methods', METHODS.join(','));
    res.setHeader('Access-Control-Allow-Headers', [...allowedHeaders].join(', '));
    return res.sendStatus(204);
  };
}

module.exports = { createCorsMiddleware };
