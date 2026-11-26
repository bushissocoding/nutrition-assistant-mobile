const SERVER_AUTH_OPTIONS = Object.freeze({
  autoRefreshToken: false,
  persistSession: false,
  detectSessionInUrl: false,
});

function createUserSupabaseClient({ settings, accessToken, createClient } = {}) {
  if (!settings?.url || !settings?.publishableKey) {
    const error = new Error('Supabase user access is not configured.');
    error.code = 'SUPABASE_NOT_CONFIGURED';
    throw error;
  }
  if (typeof accessToken !== 'string' || !accessToken.trim()) {
    const error = new Error('A valid access token is required.');
    error.code = 'INVALID_AUTH_TOKEN';
    throw error;
  }

  const makeClient = createClient || require('@supabase/supabase-js').createClient;
  return makeClient(settings.url, settings.publishableKey, {
    auth: { ...SERVER_AUTH_OPTIONS },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
}

module.exports = { createUserSupabaseClient };
