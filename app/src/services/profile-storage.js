import * as SecureStore from 'expo-secure-store';
import { normalizeProfile } from '../features/profile/profile-model.cjs';

const PROFILE_KEY = 'nutrition-advisor.profile.v1';
const CONSENT_KEY = 'nutrition-advisor.consent.v1';

export async function loadProfile() {
  const value = await SecureStore.getItemAsync(PROFILE_KEY);
  if (!value) return null;
  try { return normalizeProfile(JSON.parse(value)); }
  catch { await SecureStore.deleteItemAsync(PROFILE_KEY); return null; }
}

export async function saveProfile(profile) {
  const normalized = normalizeProfile(profile);
  await SecureStore.setItemAsync(PROFILE_KEY, JSON.stringify(normalized));
}

export async function clearStoredProfile() {
  await SecureStore.deleteItemAsync(PROFILE_KEY);
}

export async function revokeConsentAndClear() {
  await Promise.all([SecureStore.deleteItemAsync(PROFILE_KEY), SecureStore.deleteItemAsync(CONSENT_KEY)]);
}

export async function loadConsent() {
  const value = await SecureStore.getItemAsync(CONSENT_KEY);
  return value === 'accepted-v1';
}

export async function saveConsent() {
  await SecureStore.setItemAsync(CONSENT_KEY, 'accepted-v1');
}
