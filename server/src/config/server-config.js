const DEFAULT_PORT = 4000;
const ENVIRONMENTS = new Set(['development', 'test', 'production']);
const { isIP } = require('node:net');

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

function readBindAddress(value) {
  if (value === undefined || value === null || value === '') return '0.0.0.0';
  const address = String(value).trim();
  if (!address || !isIP(address)) throw invalidConfig('API_HOST', 'must be a valid IP address.');
  return address;
}

function readDemoDataEnabled(value) {
  if (value === undefined || value === null || value === '') return false;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw invalidConfig('DEMO_DATA_ENABLED', 'must be "true" or "false".');
}

function readEnvironment(value) {
  const environment = value || 'development';
  if (!ENVIRONMENTS.has(environment)) throw invalidConfig('NODE_ENV', 'must be development, test, or production.');
  return environment;
}

function readCorsOrigins(value, environment) {
  if (environment === 'production' && !value) throw invalidConfig('CORS_ORIGIN', 'must list one or more HTTPS origins in production.');
  const origins = String(value || '*').split(',').map(origin => origin.trim()).filter(Boolean);
  if (origins.length === 0 || origins.length > 1 || (origins.includes('*') && environment === 'production')) {
    throw invalidConfig('CORS_ORIGIN', 'must contain one valid origin.');
  }

  for (const origin of origins) {
    if (origin === '*') continue;
    let parsed;
    try { parsed = new URL(origin); }
    catch { throw invalidConfig('CORS_ORIGIN', 'must contain valid origins.'); }
    if (parsed.origin !== origin || parsed.username || parsed.password || parsed.search || parsed.hash
      || !['http:', 'https:'].includes(parsed.protocol)
      || (environment === 'production' && parsed.protocol !== 'https:')) {
      throw invalidConfig('CORS_ORIGIN', 'must contain valid HTTPS origins in production.');
    }
  }
  return origins;
}

function readSupabaseConfig(env, environment) {
  const values = {
    url: env.SUPABASE_URL?.trim(),
    publishableKey: env.SUPABASE_PUBLISHABLE_KEY?.trim(),
    secretKey: env.SUPABASE_SECRET_KEY?.trim(),
  };
  const present = Object.values(values).filter(Boolean).length;
  if (present === 0 && environment !== 'production') return null;
  if (present !== Object.keys(values).length) throw invalidConfig('SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, and SUPABASE_SECRET_KEY', 'must be configured together.');

  let parsedUrl;
  try { parsedUrl = new URL(values.url); }
  catch { throw invalidConfig('SUPABASE_URL', 'must be a valid HTTPS URL.'); }
  if (!['http:', 'https:'].includes(parsedUrl.protocol) || parsedUrl.username || parsedUrl.password || parsedUrl.search || parsedUrl.hash || parsedUrl.pathname !== '/') {
    throw invalidConfig('SUPABASE_URL', 'must be a valid project URL without credentials, path, query, or fragment.');
  }
  if (environment === 'production' && parsedUrl.protocol !== 'https:') throw invalidConfig('SUPABASE_URL', 'must use HTTPS in production.');
  if (!values.publishableKey.startsWith('sb_publishable_') || !values.secretKey.startsWith('sb_secret_')) {
    throw invalidConfig('SUPABASE_PUBLISHABLE_KEY and SUPABASE_SECRET_KEY', 'must use current publishable and secret key formats.');
  }
  if (values.publishableKey === values.secretKey) throw invalidConfig('SUPABASE_SECRET_KEY', 'must be different from the publishable key.');
  return values;
}

function readFdcApiKey(value) {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw invalidConfig('FDC_API_KEY', 'must be a valid server-side API key.');
  const key = value.trim();
  if (!key) return null;
  if (key.length > 200 || /[\r\n\0]/.test(key)) throw invalidConfig('FDC_API_KEY', 'must be a valid server-side API key.');
  return key;
}

function readPayosConfig(env) {
  const names = ['PAYOS_CLIENT_ID', 'PAYOS_API_KEY', 'PAYOS_CHECKSUM_KEY', 'PAYOS_RETURN_URL', 'PAYOS_CANCEL_URL', 'PAYOS_WEBHOOK_URL'];
  const present = names.filter(name => typeof env[name] === 'string' && env[name].trim()).length;
  if (present === 0) return null;
  if (present !== names.length) throw invalidConfig(names.join(', '), 'must be configured together.');
  const secret = name => {
    const value = env[name].trim();
    if (value.length > 500 || /[\r\n\0]/.test(value)) throw invalidConfig(name, 'must be valid server-only configuration.');
    return value;
  };
  const httpsUrl = name => {
    const value = secret(name);
    let parsed;
    try { parsed = new URL(value); }
    catch { throw invalidConfig(name, 'must be a valid HTTPS URL.'); }
    if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.hash) throw invalidConfig(name, 'must be a valid HTTPS URL without credentials or fragment.');
    return value;
  };
  return {
    clientId: secret('PAYOS_CLIENT_ID'),
    apiKey: secret('PAYOS_API_KEY'),
    checksumKey: secret('PAYOS_CHECKSUM_KEY'),
    returnUrl: httpsUrl('PAYOS_RETURN_URL'),
    cancelUrl: httpsUrl('PAYOS_CANCEL_URL'),
    webhookUrl: httpsUrl('PAYOS_WEBHOOK_URL'),
  };
}

function readAssistantConfig(env) {
  const apiKey = typeof env.OPENAI_API_KEY === 'string' ? env.OPENAI_API_KEY.trim() : '';
  const model = typeof env.OPENAI_MODEL === 'string' ? env.OPENAI_MODEL.trim() : '';
  if (!apiKey && !model) return null;
  if (!apiKey || !model) throw invalidConfig('OPENAI_API_KEY and OPENAI_MODEL', 'must be configured together.');
  if (apiKey.length > 500 || /[\r\n\0]/.test(apiKey)) throw invalidConfig('OPENAI_API_KEY', 'must be valid server-only configuration.');
  if (model.length > 100 || !/^[A-Za-z0-9._:-]+$/.test(model)) throw invalidConfig('OPENAI_MODEL', 'must be a valid model identifier.');
  return { apiKey, model };
}

function readExpoPushConfig(env) {
  const accessToken = typeof env.EXPO_PUSH_ACCESS_TOKEN === 'string' ? env.EXPO_PUSH_ACCESS_TOKEN.trim() : '';
  if (!accessToken) return null;
  if (accessToken.length > 500 || /[\r\n\0]/.test(accessToken)) throw invalidConfig('EXPO_PUSH_ACCESS_TOKEN', 'must be valid server-only configuration.');
  return { accessToken };
}

function readServerConfig(env = process.env) {
  const environment = readEnvironment(env.NODE_ENV);
  const demoDataEnabled = readDemoDataEnabled(env.DEMO_DATA_ENABLED);
  if (environment === 'production' && demoDataEnabled) throw invalidConfig('DEMO_DATA_ENABLED', 'must be false in production.');
  const corsOrigins = readCorsOrigins(env.CORS_ORIGIN, environment);
  return {
    port: readPort(env.PORT),
    bindAddress: readBindAddress(env.API_HOST),
    corsOrigin: env.CORS_ORIGIN || '*',
    corsOrigins,
    demoDataEnabled,
    environment,
    supabase: readSupabaseConfig(env, environment),
    fdcApiKey: readFdcApiKey(env.FDC_API_KEY),
    payos: readPayosConfig(env),
    assistant: readAssistantConfig(env),
    expoPush: readExpoPushConfig(env),
  };
}

module.exports = { readBindAddress, readServerConfig };
