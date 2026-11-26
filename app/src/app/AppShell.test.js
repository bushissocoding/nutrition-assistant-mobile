import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import AppShell from './AppShell';
import { api } from '../services/api';
import { authService } from '../services/auth-client';

jest.mock('../services/api', () => ({ api: {
  getCurrentUser: jest.fn(), getMyConsent: jest.fn(), saveMyConsent: jest.fn(), getMyProfile: jest.fn(), saveMyProfile: jest.fn(), deleteMyProfile: jest.fn(),
  getMyMealEntries: jest.fn(),
} }));
jest.mock('../services/auth-client', () => ({ isAuthConfigured: true, authClient: {}, authService: {
  restoreSession: jest.fn(), subscribe: jest.fn(() => jest.fn()), completeCallback: jest.fn(),
  register: jest.fn(), login: jest.fn(), requestEmailRecovery: jest.fn(), requestSmsRecovery: jest.fn(),
  verifySmsRecovery: jest.fn(), updateRecoveredPassword: jest.fn(), logout: jest.fn(),
} }));
jest.mock('../services/push-notifications', () => ({ unregisterPushDevice: jest.fn() }));
jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  addNotificationResponseReceivedListener: jest.fn(() => ({ remove() {} })),
  getLastNotificationResponseAsync: jest.fn(() => Promise.resolve(null)),
}));
jest.mock('expo-linking', () => ({ addEventListener: jest.fn(() => ({ remove() {} })), getInitialURL: jest.fn(() => Promise.resolve(null)) }));
jest.mock('expo-secure-store', () => ({ getItemAsync: jest.fn(() => Promise.resolve(null)), setItemAsync: jest.fn(() => Promise.resolve()), deleteItemAsync: jest.fn(() => Promise.resolve()) }));
jest.mock('../features/onboarding/LaunchScreen', () => {
  const React = require('react');
  return function MockLaunch({ onComplete }) { React.useEffect(() => { onComplete(); }, [onComplete]); return null; };
});
jest.mock('../features/onboarding/ConsentScreen', () => {
  const RN = require('react-native');
  return function MockConsent({ onContinue }) { return <><RN.Text>Consent screen</RN.Text><RN.Pressable onPress={() => onContinue({ profile_processing: true, nutrition_processing: true, data_lifecycle: true, ai_processing: false, health_record_storage: false })}><RN.Text>Continue consent</RN.Text></RN.Pressable></>; };
});
jest.mock('../features/onboarding/ProfileSetupScreen', () => {
  const RN = require('react-native');
  return function MockProfileSetup({ initialProfile, onComplete }) { return <><RN.Text>Profile setup</RN.Text><RN.Text>{initialProfile?.username || 'no username'}</RN.Text><RN.Pressable onPress={() => onComplete({ ...initialProfile, mode: 'healthy', gender: 'unspecified', age: '30', heightCm: '170', weightKg: '70', activityLevel: 'moderate', conditionType: 'unspecified', allergies: [], symptomNotes: '', redFlags: [], diagnosisNotes: '', hardLimits: {}, medicalLimitsConfirmed: false })}><RN.Text>Save profile</RN.Text></RN.Pressable></>; };
});
jest.mock('../features/dashboard/DashboardScreen', () => () => null);
jest.mock('../features/diary/DiaryScreen', () => () => null);
jest.mock('../features/grocery/GroceryScreen', () => () => null);
jest.mock('../features/meal-planning/MealPlanScreen', () => () => null);
jest.mock('../features/home/HomeScreen', () => {
  const RN = require('react-native');
  return function MockHome({ onNavigate }) { return <><RN.Text>Account Home</RN.Text><RN.Pressable onPress={() => onNavigate('profile')}><RN.Text>Open profile</RN.Text></RN.Pressable></>; };
});
jest.mock('../features/profile/ProfileScreen', () => {
  const RN = require('react-native');
  return function MockProfile({ account, onExitDemo }) { return <><RN.Text>{account?.email}</RN.Text><RN.Pressable onPress={onExitDemo}><RN.Text>Sign out</RN.Text></RN.Pressable></>; };
});
jest.mock('../features/chat/ChatScreen', () => () => null);
jest.mock('../features/notifications/NotificationsScreen', () => ({ __esModule: true, default: () => null }));
jest.mock('../features/settings/SettingsScreen', () => () => null);
jest.mock('../features/appointments/AppointmentScreen', () => () => null);
jest.mock('../features/medical-record/MedicalRecordScreen', () => () => null);
jest.mock('../features/personalization/PersonalizationScreen', () => () => null);

const user = { id: 'synthetic-user-a', email: 'user@example.test', username: 'patient_a' };
const choices = { profile_processing: true, nutrition_processing: true, data_lifecycle: true, ai_processing: false, health_record_storage: false };
const consent = { version: '2026-11-24-v1', choices, acceptedAt: '2026-11-24T00:00:00.000Z' };
const profile = { username: 'patient_a', mode: 'healthy', gender: 'unspecified', age: 30, heightCm: 170, weightKg: 70, activityLevel: 'moderate', conditionType: 'unspecified', allergies: [], symptomNotes: '', redFlags: [], diagnosisNotes: '', hardLimits: {}, medicalLimitsConfirmed: false };

beforeEach(() => {
  jest.clearAllMocks();
  authService.restoreSession.mockResolvedValue({ user, session: { access_token: 'synthetic' } });
  api.getCurrentUser.mockResolvedValue({ user: { id: user.id } });
  api.getMyConsent.mockResolvedValue({ consent, currentVersion: consent.version });
  api.getMyProfile.mockResolvedValue({ profile });
  api.saveMyConsent.mockResolvedValue({ consent, currentVersion: consent.version });
  api.saveMyProfile.mockResolvedValue({ profile });
  api.getMyMealEntries.mockResolvedValue({ items: [], hasEntries: false, totals: null });
});

async function press(screen, label) {
  await act(async () => { fireEvent.press(screen.getByText(label)); await Promise.resolve(); await Promise.resolve(); });
}

test('restores an account and loads server consent/profile before opening Home', async () => {
  const screen = render(<AppShell />);
  await waitFor(() => expect(screen.getByText('Account Home')).toBeTruthy());
  expect(authService.restoreSession).toHaveBeenCalledTimes(1);
  expect(api.getCurrentUser).toHaveBeenCalledTimes(1);
  expect(api.getMyConsent).toHaveBeenCalledTimes(1);
  expect(api.getMyProfile).toHaveBeenCalledTimes(1);
});

test('requires server consent and persists the assessment to the account API', async () => {
  api.getMyConsent.mockResolvedValue({ consent: null, currentVersion: '2026-11-24-v1' });
  const screen = render(<AppShell />);
  await waitFor(() => expect(screen.getByText('Consent screen')).toBeTruthy());
  await press(screen, 'Continue consent');
  await waitFor(() => expect(screen.getByText('Profile setup')).toBeTruthy());
  expect(api.saveMyConsent).toHaveBeenCalledWith(choices);
  expect(screen.getByText('patient_a')).toBeTruthy();
  await press(screen, 'Save profile');
  await waitFor(() => expect(screen.getByText('Account Home')).toBeTruthy());
  expect(api.saveMyProfile).toHaveBeenCalledWith(expect.objectContaining({ username: 'patient_a', age: 30, heightCm: 170, weightKg: 70 }));
});

test('logout closes the identity session and returns to Welcome', async () => {
  const screen = render(<AppShell />);
  await waitFor(() => expect(screen.getByText('Account Home')).toBeTruthy());
  await press(screen, 'Open profile');
  await press(screen, 'Sign out');
  await waitFor(() => expect(screen.getByText('Đăng Nhập')).toBeTruthy());
  expect(authService.logout).toHaveBeenCalledTimes(1);
});
