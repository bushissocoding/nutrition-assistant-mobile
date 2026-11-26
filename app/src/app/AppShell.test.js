import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import { StatusBar, StyleSheet } from 'react-native';
import AppShell, { getTopPaddingSurface } from './AppShell';
import { colors } from '../theme/tokens';
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
  return function MockProfileSetup({ initialProfile, onComplete }) { return <><RN.Text>Profile setup</RN.Text><RN.Text>{initialProfile?.username || 'no username'}</RN.Text><RN.Pressable onPress={() => onComplete({ ...initialProfile, version: 1, mode: 'healthy', gender: 'unspecified', age: '30', heightCm: '170', weightKg: '70', activityLevel: 'moderate', conditionType: 'unspecified', allergies: [], symptomNotes: '', redFlags: [], diagnosisNotes: '', hardLimits: {}, medicalLimitsConfirmed: false })}><RN.Text>Save profile</RN.Text></RN.Pressable></>; };
});
jest.mock('../features/dashboard/DashboardScreen', () => {
  const RN = require('react-native');
  return function MockDashboard() { return <RN.Text>Weekly report</RN.Text>; };
});
jest.mock('../features/diary/DiaryScreen', () => () => null);
jest.mock('../features/grocery/GroceryScreen', () => () => null);
jest.mock('../features/meal-planning/MealPlanScreen', () => {
  const RN = require('react-native');
  return function MockMealPlan({ onBack, initialPlan }) { return <><RN.Text>{initialPlan?.plan?.length ? 'Restored meal plan' : 'Meal plan screen mock'}</RN.Text><RN.Pressable onPress={onBack}><RN.Text>Meal plan back</RN.Text></RN.Pressable></>; };
});
jest.mock('../features/home/HomeScreen', () => {
  const RN = require('react-native');
  return function MockHome({ onNavigate }) { return <><RN.Text>Account Home</RN.Text><RN.Pressable onPress={() => onNavigate('planner')}><RN.Text>Open meal plan</RN.Text></RN.Pressable><RN.Pressable onPress={() => onNavigate('profile')}><RN.Text>Open profile</RN.Text></RN.Pressable><RN.Pressable onPress={() => onNavigate('appointments')}><RN.Text>Open appointments</RN.Text></RN.Pressable><RN.Pressable onPress={() => onNavigate('appointments-list')}><RN.Text>Open appointment list</RN.Text></RN.Pressable><RN.Pressable onPress={() => onNavigate('settings-help')}><RN.Text>Open help center</RN.Text></RN.Pressable></>; };
});
jest.mock('../features/profile/ProfileScreen', () => {
  const RN = require('react-native');
  return function MockProfile({ account, profile, onExitDemo, onSaveProfile }) { return <><RN.Text>{account?.email}</RN.Text><RN.Pressable onPress={onExitDemo}><RN.Text>Sign out</RN.Text></RN.Pressable><RN.Pressable onPress={() => onSaveProfile({ ...profile, username: 'Khang Updated', age: 17 })}><RN.Text>Save personal details</RN.Text></RN.Pressable></>; };
});
jest.mock('../features/chat/ChatScreen', () => {
  const RN = require('react-native');
  return function MockChatScreen({ contact, onBack }) { return <><RN.Text>{`Conversation: ${contact?.name || 'Trợ lý ảo ViCi'}`}</RN.Text><RN.Pressable onPress={onBack}><RN.Text>Conversation back</RN.Text></RN.Pressable></>; };
});
jest.mock('../features/chat/ChatInboxScreen', () => {
  const RN = require('react-native');
  return function MockChatInbox({ onOpenAssistant, onOpenDoctorChat }) { return <><RN.Text>Chat inbox mock</RN.Text><RN.Pressable onPress={onOpenAssistant}><RN.Text>Open ViCi chat</RN.Text></RN.Pressable><RN.Pressable onPress={() => onOpenDoctorChat({ id: 'provider-1', role: 'provider', name: 'Bác sĩ An', appointmentId: 'appointment-1' })}><RN.Text>Open doctor chat</RN.Text></RN.Pressable></>; };
});
jest.mock('../features/notifications/NotificationsScreen', () => ({ __esModule: true, default: () => null }));
jest.mock('../features/settings/SettingsScreen', () => {
  const RN = require('react-native');
  return function MockSettings({ screen, onBack }) { return screen === 'settings-help' ? <><RN.Text>Support center mock</RN.Text><RN.Pressable onPress={onBack}><RN.Text>Close help center</RN.Text></RN.Pressable></> : null; };
});
jest.mock('../features/appointments/AppointmentScreen', () => {
  const RN = require('react-native');
  return function MockAppointments({ initialView, onBack, onNavigate, onOpenDoctorChat }) { return <><RN.Text>Appointment Screen</RN.Text><RN.Text>{`Appointment view: ${initialView}`}</RN.Text><RN.Pressable onPress={onBack}><RN.Text>Appointment back</RN.Text></RN.Pressable><RN.Pressable onPress={() => onNavigate('appointments-list')}><RN.Text>Open appointments list</RN.Text></RN.Pressable><RN.Pressable onPress={() => onOpenDoctorChat({ id: 'appointment-2', providerId: 'provider-2', provider: { name: 'Bác sĩ Bình' } })}><RN.Text>Open provider chat</RN.Text></RN.Pressable></>; };
});
jest.mock('../features/medical-record/MedicalRecordScreen', () => () => null);
jest.mock('../features/personalization/PersonalizationScreen', () => () => null);

const user = { id: 'synthetic-user-a', email: 'user@example.test', username: 'patient_a' };
const choices = { profile_processing: true, nutrition_processing: true, data_lifecycle: true, ai_processing: false, health_record_storage: false };

test('top padding uses the surface color of the active screen', () => {
  expect(getTopPaddingSurface('home')).toBe(colors.surface);
  expect(getTopPaddingSurface('settings-help')).toBe(colors.primary);
});
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
  expect(StyleSheet.flatten(screen.getByTestId('app-page-content').props.style).paddingTop).toBe(32);
  expect(StyleSheet.flatten(screen.getByTestId('app-safe-area').props.style).backgroundColor).toBe('#FFFFFF');
  expect(StyleSheet.flatten(screen.getByTestId('app-page-content').props.style).backgroundColor).toBe('#FFFFFF');
  expect(authService.restoreSession).toHaveBeenCalledTimes(1);
  expect(api.getCurrentUser).toHaveBeenCalledTimes(1);
  expect(api.getMyConsent).toHaveBeenCalledTimes(1);
  expect(api.getMyProfile).toHaveBeenCalledTimes(1);
});

test('appointment list returns to the route that opened it', async () => {
  const screen = render(<AppShell />);
  await waitFor(() => expect(screen.getByText('Account Home')).toBeTruthy());

  await press(screen, 'Open appointment list');
  expect(screen.getByText('Appointment view: appointments-list')).toBeTruthy();
  await press(screen, 'Appointment back');
  await waitFor(() => expect(screen.getByText('Account Home')).toBeTruthy());

  await press(screen, 'Open appointments');
  expect(screen.getByText('Appointment view: appointments')).toBeTruthy();
  await press(screen, 'Open appointments list');
  expect(screen.getByText('Appointment view: appointments-list')).toBeTruthy();
  await press(screen, 'Appointment back');
  expect(screen.getByText('Appointment view: appointments')).toBeTruthy();
});

test('meal plan opens as a focused screen without tabs and returns Home', async () => {
  const screen = render(<AppShell />);
  await waitFor(() => expect(screen.getByText('Account Home')).toBeTruthy());

  await press(screen, 'Open meal plan');
  expect(screen.getByText('Meal plan screen mock')).toBeTruthy();
  expect(screen.queryAllByRole('tab')).toHaveLength(0);
  await press(screen, 'Meal plan back');
  expect(screen.getByText('Account Home')).toBeTruthy();
  expect(screen.getAllByRole('tab')).toHaveLength(4);
});

test('saves personal profile edits through the account profile API', async () => {
  const screen = render(<AppShell />);
  await waitFor(() => expect(screen.getByText('Account Home')).toBeTruthy());
  await press(screen, 'Open profile');
  await press(screen, 'Save personal details');

  await waitFor(() => expect(api.saveMyProfile).toHaveBeenCalledWith(expect.objectContaining({ username: 'Khang Updated', age: 17 })));
});

test('the last bottom tab opens the weekly report dashboard', async () => {
  const screen = render(<AppShell />);
  await waitFor(() => expect(screen.getByText('Account Home')).toBeTruthy());
  await act(async () => { fireEvent.press(screen.getAllByRole('tab')[3]); });
  await waitFor(() => expect(screen.getByText('Weekly report')).toBeTruthy());
  expect(screen.getAllByRole('tab')[3].props.accessibilityLabel).toBe('Báo cáo');
  expect(screen.getAllByRole('tab')[3].props.accessibilityState.selected).toBe(true);
});

test('chat tab opens the inbox and hides the main tabs inside an assistant conversation', async () => {
  const screen = render(<AppShell />);
  await waitFor(() => expect(screen.getByText('Account Home')).toBeTruthy());
  await act(async () => { fireEvent.press(screen.getByLabelText('Trò chuyện')); });
  expect(screen.getByText('Chat inbox mock')).toBeTruthy();
  expect(screen.getAllByRole('tab')).toHaveLength(4);

  await press(screen, 'Open ViCi chat');
  expect(screen.getByText('Conversation: Trợ lý ảo ViCi')).toBeTruthy();
  expect(screen.queryAllByRole('tab')).toHaveLength(0);

  await press(screen, 'Conversation back');
  expect(screen.getByText('Chat inbox mock')).toBeTruthy();
  expect(screen.getAllByRole('tab')).toHaveLength(4);
});

test('doctor conversations return to the screen from which they were opened', async () => {
  const screen = render(<AppShell />);
  await waitFor(() => expect(screen.getByText('Account Home')).toBeTruthy());
  await act(async () => { fireEvent.press(screen.getByLabelText('Trò chuyện')); });
  await press(screen, 'Open doctor chat');
  expect(screen.getByText('Conversation: Bác sĩ An')).toBeTruthy();
  expect(screen.queryAllByRole('tab')).toHaveLength(0);
  await press(screen, 'Conversation back');
  expect(screen.getByText('Chat inbox mock')).toBeTruthy();
  expect(screen.getAllByRole('tab')).toHaveLength(4);

  await act(async () => { fireEvent.press(screen.getByLabelText('Trang chủ')); });
  await press(screen, 'Open appointments');
  expect(screen.getByText('Appointment Screen')).toBeTruthy();
  await press(screen, 'Open provider chat');
  expect(screen.getByText('Conversation: Bác sĩ Bình')).toBeTruthy();
  await press(screen, 'Conversation back');
  expect(screen.getByText('Appointment Screen')).toBeTruthy();
});

test('Home help shortcut opens the support center and can return Home', async () => {
  const screen = render(<AppShell />);
  await waitFor(() => expect(screen.getByText('Account Home')).toBeTruthy());

  await press(screen, 'Open help center');
  expect(screen.getByText('Support center mock')).toBeTruthy();
  expect(StyleSheet.flatten(screen.getByTestId('app-safe-area').props.style).backgroundColor).toBe(colors.primary);
  expect(StyleSheet.flatten(screen.getByTestId('app-page-content').props.style).paddingTop).toBe(32);
  expect(StyleSheet.flatten(screen.getByTestId('app-page-content').props.style).backgroundColor).toBe(colors.primary);
  expect(screen.UNSAFE_getByType(StatusBar).props.barStyle).toBe('light-content');
  expect(screen.getAllByRole('tab')).toHaveLength(4);
  await press(screen, 'Close help center');
  expect(screen.getByText('Account Home')).toBeTruthy();
});

test('requires server consent and persists the assessment to the account API', async () => {
  api.getMyConsent.mockResolvedValue({ consent: null, currentVersion: '2026-11-24-v1' });
  const screen = render(<AppShell />);
  await waitFor(() => expect(screen.getByText('Consent screen')).toBeTruthy());
  expect(StyleSheet.flatten(screen.getByTestId('app-page-content').props.style).paddingTop).toBe(32);
  await press(screen, 'Continue consent');
  await waitFor(() => expect(screen.getByText('Profile setup')).toBeTruthy());
  expect(StyleSheet.flatten(screen.getByTestId('app-page-content').props.style).paddingTop).toBe(32);
  expect(api.saveMyConsent).toHaveBeenCalledWith(choices);
  expect(screen.getByText('patient_a')).toBeTruthy();
  await press(screen, 'Save profile');
  await waitFor(() => expect(screen.getByText('Account Home')).toBeTruthy());
  expect(api.saveMyProfile).toHaveBeenCalledWith(expect.objectContaining({ username: 'patient_a', age: 30, heightCm: 170, weightKg: 70 }));
  expect(api.saveMyProfile.mock.calls[0][0]).not.toHaveProperty('version');
});

test('logout closes the identity session and returns to Welcome', async () => {
  const screen = render(<AppShell />);
  await waitFor(() => expect(screen.getByText('Account Home')).toBeTruthy());
  await press(screen, 'Open profile');
  await press(screen, 'Sign out');
  await waitFor(() => expect(screen.getByText('Đăng Nhập')).toBeTruthy());
  expect(authService.logout).toHaveBeenCalledTimes(1);
});
