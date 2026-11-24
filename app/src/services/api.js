import * as SecureStore from 'expo-secure-store';
import { createApiClient, createApiMethods } from './api-client.cjs';
import { createDemoNamespaceStore } from './demo-namespace-storage.cjs';
import { authClient } from './auth-client';

const namespaceStore = createDemoNamespaceStore({ storage: SecureStore });
const client = createApiClient({
  baseUrl: process.env.EXPO_PUBLIC_API_URL,
  namespaceStore,
  getAccessToken: async () => {
    if (!authClient) return null;
    const { data, error } = await authClient.auth.getSession();
    if (error) throw error;
    return data?.session?.access_token || null;
  },
});

export const api = createApiMethods(client);
