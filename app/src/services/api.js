import * as SecureStore from 'expo-secure-store';
import { createApiClient, createApiMethods } from './api-client.cjs';
import { createDemoNamespaceStore } from './demo-namespace-storage.cjs';

const namespaceStore = createDemoNamespaceStore({ storage: SecureStore });
const client = createApiClient({
  baseUrl: process.env.EXPO_PUBLIC_API_URL,
  namespaceStore,
});

export const api = createApiMethods(client);
