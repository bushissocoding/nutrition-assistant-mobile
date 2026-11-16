const { isDemoDataEnabled, isValidDemoNamespace } = require('../services/demo-data-policy');

function createDemoScopeMiddleware({ env = process.env } = {}) {
  const enabled = isDemoDataEnabled(env);

  return function requireDemoScope(req, res, next) {
    if (!enabled) return res.status(503).json({ error: 'Lưu trữ demo đang tắt.', code: 'DEMO_DATA_DISABLED' });

    const namespace = req.get('X-Demo-Namespace');
    if (!isValidDemoNamespace(namespace)) {
      return res.status(400).json({ error: 'Thiếu hoặc sai X-Demo-Namespace.', code: 'DEMO_NAMESPACE_REQUIRED' });
    }

    req.demoNamespace = namespace;
    return next();
  };
}

module.exports = { createDemoScopeMiddleware };
