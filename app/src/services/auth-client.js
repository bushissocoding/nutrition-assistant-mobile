import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';
import * as Linking from 'expo-linking';
import { createAuthSessionStorage } from './auth-session-storage.cjs';
import { createAuthService } from './auth-service.cjs';

const url = process.env.EXPO_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

export const isAuthConfigured = Boolean(url && publishableKey);
export const authClient = isAuthConfigured
  ? createClient(url, publishableKey, {
    auth: {
      storage: createAuthSessionStorage({ storage: SecureStore }),
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      flowType: 'pkce',
    },
  })
  : null;

export const authService = createAuthService({
  client: authClient,
  callbackUrl: () => Linking.createURL('auth/callback'),
  parseUrl: value => new URL(value),
});
