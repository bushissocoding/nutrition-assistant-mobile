const DEFAULT_PORT = 4000;

function invalidConfig(setting, requirement) {
  const error = new Error(`${setting} ${requirement}`);
  error.code = 'INVALID_SERVER_CONFIG';
  return error;
}

function readPort(value) {
  if (value === undefined || value === null || value === '') return DEFAULT_PORT;

  const normalized = String(value).trim();
  if (!normalized || !/^\d+$/.test(normalized)) {
    throw invalidConfig('PORT', 'must be an integer between 1 and 65535.');
  }

  const port = Number(normalized);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
    throw invalidConfig('PORT', 'must be an integer between 1 and 65535.');
  }

  return port;
}

function readDemoDataEnabled(value) {
  if (value === undefined || value === null || value === '') return false;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw invalidConfig('DEMO_DATA_ENABLED', 'must be "true" or "false".');
}

function readServerConfig(env = process.env) {
  return {
    port: readPort(env.PORT),
    corsOrigin: env.CORS_ORIGIN || '*',
    demoDataEnabled: readDemoDataEnabled(env.DEMO_DATA_ENABLED),
  };
}

module.exports = { readServerConfig };
