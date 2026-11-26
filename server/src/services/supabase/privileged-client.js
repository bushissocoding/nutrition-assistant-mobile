const SERVER_AUTH_OPTIONS = Object.freeze({
  autoRefreshToken: false,
  persistSession: false,
  detectSessionInUrl: false,
});

function createPrivilegedSupabaseClient({ settings, createClient } = {}) {
  if (!settings?.url || !settings?.secretKey) {
    const error = new Error('Privileged Supabase access is not configured.');
    error.code = 'SUPABASE_NOT_CONFIGURED';
    throw error;
  }

  const makeClient = createClient || require('@supabase/supabase-js').createClient;
  return makeClient(settings.url, settings.secretKey, {
    auth: { ...SERVER_AUTH_OPTIONS },
  });
}

module.exports = { createPrivilegedSupabaseClient };
