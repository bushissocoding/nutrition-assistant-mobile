import * as SecureStore from 'expo-secure-store';
import { loadConsent, revokeConsentAndClear, saveConsent } from './profile-storage';
import { CONSENT_CHOICES, CONSENT_VERSION } from '../features/onboarding/consent-model.cjs';

jest.mock('expo-secure-store', () => ({
  getItemAsync: jest.fn(),
  setItemAsync: jest.fn(),
  deleteItemAsync: jest.fn(),
}));

const consentKey = 'nutrition-advisor.consent.v2';
const legacyConsentKey = 'nutrition-advisor.consent.v1';
const choices = Object.fromEntries(CONSENT_CHOICES.map(({ key }) => [key, true]));
let values;

beforeEach(() => {
  jest.clearAllMocks();
  values = new Map();
  SecureStore.getItemAsync.mockImplementation(async key => values.get(key) ?? null);
  SecureStore.setItemAsync.mockImplementation(async (key, value) => { values.set(key, value); });
  SecureStore.deleteItemAsync.mockImplementation(async key => { values.delete(key); });
});

test('persists a device-local consent receipt with version, choices and time', async () => {
  const receipt = await saveConsent(choices, new Date('2026-11-17T01:02:03.000Z'));

  expect(receipt).toEqual({ version: CONSENT_VERSION, acceptedAt: '2026-11-17T01:02:03.000Z', choices });
  expect(values.get(consentKey)).toBe(JSON.stringify(receipt));
  expect(SecureStore.setItemAsync).toHaveBeenCalledWith(consentKey, JSON.stringify(receipt));
  expect(await loadConsent()).toEqual(receipt);
});

test('does not treat an old or malformed consent value as current', async () => {
  values.set(consentKey, JSON.stringify({ version: 'old', acceptedAt: '2026-11-17T01:02:03.000Z', choices }));
  expect(await loadConsent()).toBeNull();
  expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(consentKey);
});

test('clears legacy acceptance instead of silently upgrading its missing receipt fields', async () => {
  values.set(legacyConsentKey, 'accepted-v1');
  expect(await loadConsent()).toBeNull();
  expect(SecureStore.deleteItemAsync).toHaveBeenCalledWith(legacyConsentKey);
});

test('withdrawal clears profile and current or legacy consent keys', async () => {
  values.set('nutrition-advisor.profile.v1', '{"mode":"healthy"}');
  values.set(consentKey, JSON.stringify({ version: CONSENT_VERSION, acceptedAt: '2026-11-17T01:02:03.000Z', choices }));
  values.set(legacyConsentKey, 'accepted-v1');

  await revokeConsentAndClear();

  expect(values.size).toBe(0);
});
