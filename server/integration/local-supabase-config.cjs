'use strict';

const { execFileSync } = require('node:child_process');

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]', '::1']);

function configurationError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function parseLocalSupabaseStatus(status) {
  let value = status;
  if (typeof status === 'string') {
    try { value = JSON.parse(status); }
    catch { throw configurationError('LOCAL_SUPABASE_STATUS_INVALID', 'Supabase CLI status was not valid JSON.'); }
  }

  const env = value?.env && typeof value.env === 'object' && !Array.isArray(value.env)
    ? value.env
    : value;
  const apiUrl = env?.API_URL;
  const publishableKey = env?.PUBLISHABLE_KEY;
  const secretKey = env?.SECRET_KEY;
  if (typeof apiUrl !== 'string' || typeof publishableKey !== 'string' || typeof secretKey !== 'string') {
    throw configurationError('LOCAL_SUPABASE_CONFIG_INVALID', 'A running local Supabase stack with current publishable and secret keys is required.');
  }

  let url;
  try { url = new URL(apiUrl); }
  catch { throw configurationError('LOCAL_SUPABASE_CONFIG_INVALID', 'The local Supabase API URL is invalid.'); }
  if (!['http:', 'https:'].includes(url.protocol) || !LOOPBACK_HOSTS.has(url.hostname.toLowerCase())
    || url.username || url.password || url.pathname !== '/' || url.search || url.hash) {
    throw configurationError('LOCAL_SUPABASE_REQUIRED', 'This integration command only runs against a loopback Supabase URL.');
  }
  if (!publishableKey.startsWith('sb_publishable_') || !secretKey.startsWith('sb_secret_') || publishableKey === secretKey) {
    throw configurationError('LOCAL_SUPABASE_CONFIG_INVALID', 'The local stack must expose distinct current publishable and secret keys.');
  }

  return {
    url: url.toString().replace(/\/$/, ''),
    publishableKey,
    secretKey,
  };
}

function readLocalSupabaseSettings({ execFile = execFileSync } = {}) {
  let output;
  try {
    output = execFile('supabase', ['status', '--output-format', 'json'], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
      maxBuffer: 1024 * 1024,
    });
  } catch {
    throw configurationError('LOCAL_SUPABASE_STATUS_UNAVAILABLE', 'Start the local Supabase stack with `supabase start` before this integration test.');
  }
  return parseLocalSupabaseStatus(output);
}

module.exports = { LOOPBACK_HOSTS, parseLocalSupabaseStatus, readLocalSupabaseSettings };
