import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import AppShell from './AppShell';
import { api } from '../services/api';
import { clearStoredProfile, loadConsent, loadProfile, revokeConsentAndClear, saveConsent } from '../services/profile-storage';

jest.mock('../services/api', () => ({ api: { getMealEntries: jest.fn(), purgeMealEntries: jest.fn(), purgeShoppingLists: jest.fn() } }));
jest.mock('../services/profile-storage', () => ({
  clearStoredProfile: jest.fn(),
  loadConsent: jest.fn(),
  loadProfile: jest.fn(),
  revokeConsentAndClear: jest.fn(),
  saveConsent: jest.fn(),
  saveProfile: jest.fn(),
}));
jest.mock('../features/onboarding/ConsentScreen', () => {
  const ReactNative = require('react-native');
  return function MockConsent({ onContinue, onBack, onWithdraw }) {
    return <>
      <ReactNative.Text>Consent screen</ReactNative.Text>
      <ReactNative.Pressable onPress={() => onContinue({ local_profile_storage: true })}><ReactNative.Text>Continue consent</ReactNative.Text></ReactNative.Pressable>
      {!!onBack && <ReactNative.Pressable onPress={onBack}><ReactNative.Text>Back from consent</ReactNative.Text></ReactNative.Pressable>}
      {!!onWithdraw && <ReactNative.Pressable onPress={onWithdraw}><ReactNative.Text>Withdraw from consent</ReactNative.Text></ReactNative.Pressable>}
    </>;
  };
});
jest.mock('../features/onboarding/ProfileSetupScreen', () => {
  const ReactNative = require('react-native');
  return function MockProfileSetup({ onBack, onWithdrawConsent }) {
    return <>
      <ReactNative.Text>Profile setup</ReactNative.Text>
      {!!onBack && <ReactNative.Pressable onPress={onBack}><ReactNative.Text>Back to consent</ReactNative.Text></ReactNative.Pressable>}
      {!!onWithdrawConsent && <ReactNative.Pressable onPress={onWithdrawConsent}><ReactNative.Text>Withdraw from setup</ReactNative.Text></ReactNative.Pressable>}
    </>;
  };
});
jest.mock('../features/dashboard/DashboardScreen', () => () => null);
jest.mock('../features/diary/DiaryScreen', () => {
  const ReactNative = require('react-native');
  return function MockDiary({ onDiaryMutation }) {
    return <ReactNative.Pressable onPress={onDiaryMutation}><ReactNative.Text>Notify saved diary change</ReactNative.Text></ReactNative.Pressable>;
  };
});
jest.mock('../features/grocery/GroceryScreen', () => () => null);
jest.mock('../features/meal-planning/MealPlanScreen', () => () => null);
jest.mock('../features/home/HomeScreen', () => {
  const ReactNative = require('react-native');
  return function MockHome({ diary, diaryTotals, onNavigate, onRetryDiary, diaryError }) {
    return <>
      <ReactNative.Text>{diary[0]?.foodName || 'No diary item'}</ReactNative.Text>
      <ReactNative.Text>{diaryTotals.energyKcal} kcal</ReactNative.Text>
      {!!diaryError && <ReactNative.Text>{diaryError}</ReactNative.Text>}
      <ReactNative.Pressable onPress={() => onNavigate('profile')}><ReactNative.Text>Open profile</ReactNative.Text></ReactNative.Pressable>
      <ReactNative.Pressable onPress={() => onNavigate('diary')}><ReactNative.Text>Open diary</ReactNative.Text></ReactNative.Pressable>
      <ReactNative.Pressable onPress={onRetryDiary}><ReactNative.Text>Retry hydration</ReactNative.Text></ReactNative.Pressable>
    </>;
  };
});
jest.mock('../features/profile/ProfileScreen', () => {
  const ReactNative = require('react-native');
  const React = require('react');
  return function MockProfile({ onDeleted, onWithdrawConsent, onReviewConsent }) {
    const [error, setError] = React.useState('');
    async function remove() {
      try { await onDeleted(); }
      catch (failure) { setError(failure.message); }
    }
    return <>
      <ReactNative.Pressable onPress={remove}><ReactNative.Text>Delete profile</ReactNative.Text></ReactNative.Pressable>
      <ReactNative.Pressable onPress={onReviewConsent}><ReactNative.Text>Review consent</ReactNative.Text></ReactNative.Pressable>
      <ReactNative.Pressable onPress={onWithdrawConsent}><ReactNative.Text>Withdraw consent</ReactNative.Text></ReactNative.Pressable>
      {!!error && <ReactNative.Text>{error}</ReactNative.Text>}
    </>;
  };
});

const profile = { mode: 'healthy', age: 30, heightCm: 170, weightKg: 70, activityLevel: 'moderate', allergies: [], redFlags: [] };
const entry = { id: 'entry-1', foodName: 'Đậu phụ', nutrients: { energyKcal: 80 } };

beforeEach(() => {
  jest.clearAllMocks();
  loadConsent.mockResolvedValue(true);
  loadProfile.mockResolvedValue(profile);
  api.getMealEntries.mockResolvedValue({ items: [entry], totals: { energyKcal: 80 } });
  api.purgeMealEntries.mockResolvedValue(null);
  api.purgeShoppingLists.mockResolvedValue(null);
  clearStoredProfile.mockResolvedValue(undefined);
  revokeConsentAndClear.mockResolvedValue(undefined);
  saveConsent.mockResolvedValue({ version: 'demo-consent-v1-2026-11-17', acceptedAt: '2026-11-17T01:02:03.000Z', choices: { local_profile_storage: true } });
});

async function press(screen, label) {
  await act(async () => {
    fireEvent.press(screen.getByText(label));
    for (let index = 0; index < 8; index += 1) await Promise.resolve();
  });
}

test('hydrates Home from the API for the current local day after loading the saved profile', async () => {
  const screen = render(<AppShell />);

  await waitFor(() => expect(screen.getByText('Đậu phụ')).toBeTruthy());
  expect(screen.getByText('80 kcal')).toBeTruthy();
  expect(api.getMealEntries).toHaveBeenCalledWith(expect.objectContaining({
    date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    timeZone: expect.any(String),
  }));
});

test('refreshes the Home cache after a diary mutation is confirmed by the server', async () => {
  api.getMealEntries.mockResolvedValueOnce({ items: [entry], totals: { energyKcal: 80 } })
    .mockResolvedValueOnce({ items: [{ ...entry, id: 'entry-2' }], totals: { energyKcal: 115 } });
  const screen = render(<AppShell />);

  await waitFor(() => expect(screen.getByText('80 kcal')).toBeTruthy());
  await press(screen, 'Open diary');
  await press(screen, 'Notify saved diary change');
  await waitFor(() => expect(api.getMealEntries).toHaveBeenCalledTimes(2));
  await press(screen, 'Trang chủ');
  await waitFor(() => expect(screen.getByText('115 kcal')).toBeTruthy());
});

test('records the required choices before moving from consent to profile setup', async () => {
  loadConsent.mockResolvedValue(null);
  loadProfile.mockResolvedValue(null);
  const choices = { local_profile_storage: true };
  const screen = render(<AppShell />);

  await waitFor(() => expect(screen.getByText('Consent screen')).toBeTruthy());
  await press(screen, 'Continue consent');
  await waitFor(() => expect(screen.getByText('Profile setup')).toBeTruthy());
  expect(saveConsent).toHaveBeenCalledWith(choices);
});

test('lets the user review consent from the profile and return without leaving the profile', async () => {
  const screen = render(<AppShell />);

  await waitFor(() => expect(screen.getByText('Đậu phụ')).toBeTruthy());
  await press(screen, 'Open profile');
  await press(screen, 'Review consent');
  expect(screen.getByText('Consent screen')).toBeTruthy();
  await press(screen, 'Back from consent');
  expect(screen.getByText('Delete profile')).toBeTruthy();
});

test('keeps consent when a withdrawal purge fails and clears it after a successful retry', async () => {
  api.purgeShoppingLists.mockRejectedValueOnce(new Error('API đang ngoại tuyến.')).mockResolvedValueOnce(null);
  const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, actions) => actions?.find(action => action.style === 'destructive')?.onPress());
  const screen = render(<AppShell />);

  await waitFor(() => expect(screen.getByText('Đậu phụ')).toBeTruthy());
  await press(screen, 'Open profile');
  await press(screen, 'Withdraw consent');
  await waitFor(() => expect(screen.getByText('API đang ngoại tuyến.')).toBeTruthy());
  expect(revokeConsentAndClear).not.toHaveBeenCalled();
  expect(screen.getByText('Delete profile')).toBeTruthy();

  await press(screen, 'Withdraw consent');
  await waitFor(() => expect(screen.getByText('Consent screen')).toBeTruthy());
  expect(revokeConsentAndClear).toHaveBeenCalledTimes(1);
  expect(alertSpy).toHaveBeenCalledWith('Đã rút đồng ý và xóa dữ liệu demo', expect.any(String));
  alertSpy.mockRestore();
});

test('purges the server diary and grocery list before clearing the local profile', async () => {
  const order = [];
  api.purgeMealEntries.mockImplementation(async () => { order.push('diary-purge'); });
  api.purgeShoppingLists.mockImplementation(async () => { order.push('grocery-purge'); });
  clearStoredProfile.mockImplementation(async () => { order.push('local-profile-clear'); });
  const screen = render(<AppShell />);

  await waitFor(() => expect(screen.getByText('Đậu phụ')).toBeTruthy());
  await press(screen, 'Open profile');
  await press(screen, 'Delete profile');
  await waitFor(() => expect(screen.getByText('Profile setup')).toBeTruthy());

  expect(order).toEqual(['diary-purge', 'grocery-purge', 'local-profile-clear']);
});

test('keeps the local profile when the server refuses to purge the diary', async () => {
  api.purgeMealEntries.mockRejectedValue(new Error('API đang ngoại tuyến.'));
  const screen = render(<AppShell />);

  await waitFor(() => expect(screen.getByText('Đậu phụ')).toBeTruthy());
  await press(screen, 'Open profile');
  await press(screen, 'Delete profile');

  await waitFor(() => expect(screen.getByText('API đang ngoại tuyến.')).toBeTruthy());
  expect(clearStoredProfile).not.toHaveBeenCalled();
  expect(screen.getByText('Delete profile')).toBeTruthy();
});

test('keeps the local profile when grocery purge fails and permits retry after a partial remote purge', async () => {
  api.purgeShoppingLists.mockRejectedValueOnce(new Error('Không xóa được danh sách.')).mockResolvedValueOnce(null);
  const screen = render(<AppShell />);

  await waitFor(() => expect(screen.getByText('Đậu phụ')).toBeTruthy());
  await press(screen, 'Open profile');
  await press(screen, 'Delete profile');
  await waitFor(() => expect(screen.getByText('Không xóa được danh sách.')).toBeTruthy());
  expect(api.purgeMealEntries).toHaveBeenCalledTimes(1);
  expect(api.purgeShoppingLists).toHaveBeenCalledTimes(1);
  expect(clearStoredProfile).not.toHaveBeenCalled();

  await press(screen, 'Delete profile');
  await waitFor(() => expect(screen.getByText('Profile setup')).toBeTruthy());
  expect(api.purgeMealEntries).toHaveBeenCalledTimes(2);
  expect(api.purgeShoppingLists).toHaveBeenCalledTimes(2);
  expect(clearStoredProfile).toHaveBeenCalledTimes(1);
});
