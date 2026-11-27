import * as SecureStore from './secure-storage';
import { normalizeProfile } from '../features/profile/profile-model.cjs';
import { createConsentRecord, isCurrentConsentRecord } from '../features/onboarding/consent-model.cjs';

const PROFILE_KEY = 'nutrition-advisor.profile.v1';
const CONSENT_KEY = 'nutrition-advisor.consent.v2';
const LEGACY_CONSENT_KEY = 'nutrition-advisor.consent.v1';

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
  await Promise.all([
    SecureStore.deleteItemAsync(PROFILE_KEY),
    SecureStore.deleteItemAsync(CONSENT_KEY),
    SecureStore.deleteItemAsync(LEGACY_CONSENT_KEY),
  ]);
}

export async function loadConsent() {
  const value = await SecureStore.getItemAsync(CONSENT_KEY);
  if (value) {
    try {
      const record = JSON.parse(value);
      if (isCurrentConsentRecord(record)) return record;
    } catch { /* Invalid or outdated local consent must be reviewed again. */ }
    await SecureStore.deleteItemAsync(CONSENT_KEY);
  }
  const legacyValue = await SecureStore.getItemAsync(LEGACY_CONSENT_KEY);
  if (legacyValue !== null) await SecureStore.deleteItemAsync(LEGACY_CONSENT_KEY);
  return null;
}

export async function saveConsent(choices, acceptedAt = new Date()) {
  const record = createConsentRecord(choices, acceptedAt);
  await SecureStore.setItemAsync(CONSENT_KEY, JSON.stringify(record));
  await SecureStore.deleteItemAsync(LEGACY_CONSENT_KEY);
  return record;
}
