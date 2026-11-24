import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { api } from '../../services/api';
import { registerPushDevice } from '../../services/push-notifications';
import SettingsScreen from './SettingsScreen';

jest.mock('../../services/api', () => ({ api: { getMyNotificationPreferences: jest.fn(), saveMyNotificationPreferences: jest.fn() } }));
jest.mock('../../services/push-notifications', () => ({ registerPushDevice: jest.fn() }));

const notificationPreferences = { inAppAppointments: true, inAppPayments: true, inAppMessages: true, pushEnabled: false, pushAppointments: true, pushPayments: true, pushMessages: true };

beforeEach(() => {
  jest.clearAllMocks();
  api.getMyNotificationPreferences.mockResolvedValue({ preferences: { ...notificationPreferences, updatedAt: '2026-11-23T00:00:00Z' } });
  api.saveMyNotificationPreferences.mockImplementation(async value => ({ preferences: { ...value, updatedAt: '2026-11-24T00:00:00Z' } }));
});

test('notification preferences load from the account and save changes to the API', async () => {
  const screen = render(<SettingsScreen screen="settings-notifications" account={{ id: 'account-1' }} />);
  const appointments = await screen.findByRole('switch', { name: 'Lịch hẹn' });
  await waitFor(() => expect(appointments.props.accessibilityState.disabled).toBe(false));
  expect(appointments.props.accessibilityState.checked).toBe(true);
  fireEvent.press(appointments);
  await waitFor(() => expect(api.saveMyNotificationPreferences).toHaveBeenCalledWith({ ...notificationPreferences, inAppAppointments: false }));
  expect(screen.getByRole('switch', { name: 'Lịch hẹn' }).props.accessibilityState.checked).toBe(false);
});

test('enables push only after OS device registration succeeds and records the account choice', async () => {
  registerPushDevice.mockResolvedValue({ expoPushToken: 'ExponentPushToken[device-token]', platform: 'ios' });
  const screen = render(<SettingsScreen screen="settings-notifications" account={{ id: 'account-1' }} />);
  const push = await screen.findByRole('switch', { name: 'Gửi tới thiết bị này' });
  await waitFor(() => expect(push.props.accessibilityState.disabled).toBe(false));
  fireEvent.press(push);
  await waitFor(() => expect(registerPushDevice).toHaveBeenCalledWith({ api, userId: 'account-1' }));
  await waitFor(() => expect(api.saveMyNotificationPreferences).toHaveBeenCalledWith({ ...notificationPreferences, pushEnabled: true }));
  expect(screen.getByRole('switch', { name: 'Gửi tới thiết bị này' }).props.accessibilityState.checked).toBe(true);
});

test('rolls push opt-in back if the device cannot be registered', async () => {
  registerPushDevice.mockRejectedValue(new Error('EAS Project ID is missing'));
  const screen = render(<SettingsScreen screen="settings-notifications" account={{ id: 'account-1' }} />);
  fireEvent.press(await screen.findByRole('switch', { name: 'Gửi tới thiết bị này' }));
  await waitFor(() => expect(api.saveMyNotificationPreferences).toHaveBeenCalledTimes(2));
  expect(api.saveMyNotificationPreferences.mock.calls[1][0]).toMatchObject({ pushEnabled: false });
  expect(await screen.findByText('EAS Project ID is missing')).toBeTruthy();
  expect(screen.getByRole('switch', { name: 'Gửi tới thiết bị này' }).props.accessibilityState.checked).toBe(false);
});

test('settings main screen follows the three reference destinations', () => {
  const onNavigate = jest.fn();
  const screen = render(<SettingsScreen onNavigate={onNavigate} />);
  fireEvent.press(screen.getByRole('button', { name: /Cài đặt thông báo/ }));
  expect(onNavigate).toHaveBeenCalledWith('settings-notifications');
  expect(screen.getByText('Quản lý mật khẩu')).toBeTruthy();
  expect(screen.getByText('Xóa tài khoản')).toBeTruthy();
  expect(screen.queryByText('Chính sách và quyền riêng tư')).toBeNull();
});

test('forgot password opens recovery from account settings', () => {
  const onForgotPassword = jest.fn();
  const screen = render(<SettingsScreen screen="settings-password" onForgotPassword={onForgotPassword} />);
  fireEvent.press(screen.getByRole('button', { name: 'Quên mật khẩu?' }));
  expect(onForgotPassword).toHaveBeenCalledTimes(1);
});

test('password changes use the authenticated account service', async () => {
  const onUpdatePassword = jest.fn().mockResolvedValue({ status: 'updated' });
  const screen = render(<SettingsScreen screen="settings-password" onUpdatePassword={onUpdatePassword} />);
  fireEvent.changeText(screen.getByLabelText('Mật khẩu mới'), 'secure-pass');
  fireEvent.changeText(screen.getByLabelText('Xác nhận mật khẩu mới'), 'secure-pass');
  fireEvent.press(screen.getByRole('button', { name: 'Đổi mật khẩu' }));
  await waitFor(() => expect(onUpdatePassword).toHaveBeenCalledWith({ password: 'secure-pass', confirmPassword: 'secure-pass' }));
  expect(await screen.findByText('Đã cập nhật mật khẩu.')).toBeTruthy();
});

test('recovery phone is shown only after the OTP verification action succeeds', async () => {
  const onRequestPhoneLink = jest.fn().mockResolvedValue({ status: 'verification-required' });
  const onVerifyPhoneLink = jest.fn().mockResolvedValue({ status: 'verified' });
  const screen = render(<SettingsScreen screen="settings-phone" onRequestPhoneLink={onRequestPhoneLink} onVerifyPhoneLink={onVerifyPhoneLink} />);
  fireEvent.changeText(screen.getByLabelText('Số điện thoại (E.164)'), '+84900123456');
  fireEvent.press(screen.getByRole('button', { name: 'Liên kết số điện thoại' }));
  await waitFor(() => expect(onRequestPhoneLink).toHaveBeenCalledWith('+84900123456'));
  fireEvent.changeText(screen.getByLabelText('Mã xác nhận SMS'), '123456');
  fireEvent.press(screen.getByRole('button', { name: 'Xác minh số điện thoại' }));
  await waitFor(() => expect(onVerifyPhoneLink).toHaveBeenCalledWith({ phone: '+84900123456', token: '123456' }));
  expect(await screen.findByText('Số điện thoại đã được xác minh.')).toBeTruthy();
});

test('account data can be exported and account deletion requires the destructive confirmation action', async () => {
  const onExportAccount = jest.fn();
  const onDeleteAccount = jest.fn().mockResolvedValue(undefined);
  const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
  const screen = render(<SettingsScreen screen="settings-delete" onExportAccount={onExportAccount} onDeleteAccount={onDeleteAccount} />);
  fireEvent.press(screen.getByRole('button', { name: 'Xuất dữ liệu của tôi' }));
  expect(onExportAccount).toHaveBeenCalledTimes(1);
  fireEvent.press(screen.getByRole('button', { name: 'Xóa tài khoản vĩnh viễn' }));
  const destructiveAction = alert.mock.calls[0][2].find(action => action.style === 'destructive');
  await destructiveAction.onPress();
  await waitFor(() => expect(onDeleteAccount).toHaveBeenCalledTimes(1));
  alert.mockRestore();
});

test('help questions expand to show the prototype service boundary', () => {
  const screen = render(<SettingsScreen screen="settings-help" />);
  fireEvent.press(screen.getByText('Ứng dụng có tư vấn y tế không?'));
  expect(screen.getByText(/không chẩn đoán hoặc điều trị/i)).toBeTruthy();
});

test('shows the reference help center header, searchable FAQ categories, and filtered questions', () => {
  const screen = render(<SettingsScreen screen="settings-help" />);

  expect(screen.getByText('Trung Tâm Hỗ Trợ')).toBeTruthy();
  expect(screen.getByLabelText('Tìm kiếm trợ giúp')).toBeTruthy();
  expect(screen.getByRole('tab', { name: 'Hỏi đáp' }).props.accessibilityState.selected).toBe(true);
  expect(screen.getByRole('button', { name: 'Phổ biến' })).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'Dịch vụ' }));
  expect(screen.getByText('Tôi có thể đặt lịch với nhà cung cấp không?')).toBeTruthy();
  expect(screen.queryByText('Ứng dụng có tư vấn y tế không?')).toBeNull();

  fireEvent.changeText(screen.getByLabelText('Tìm kiếm trợ giúp'), 'đặt lịch');
  expect(screen.getByText('Tôi có thể đặt lịch với nhà cung cấp không?')).toBeTruthy();
  expect(screen.queryByText('Tôi có thể chụp ảnh kết quả xét nghiệm không?')).toBeNull();
});

test('shows expandable website and Facebook rows with their current setup status', () => {
  const screen = render(<SettingsScreen screen="settings-help" />);
  fireEvent.press(screen.getByRole('tab', { name: 'Liên hệ' }));

  const website = screen.getByRole('button', { name: 'Website' });
  expect(website.props.accessibilityState.expanded).toBe(false);
  fireEvent.press(website);
  expect(screen.getByText('Website hỗ trợ chưa được cấu hình.')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Facebook' })).toBeTruthy();
});
