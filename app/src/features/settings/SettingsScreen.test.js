import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import SettingsScreen from './SettingsScreen';

test('notification preferences expose switches with working selected states', () => {
  const screen = render(<SettingsScreen screen="settings-notifications" />);
  const sound = screen.getByRole('switch', { name: 'Âm thanh' });
  expect(sound.props.accessibilityState.checked).toBe(false);
  fireEvent.press(sound);
  expect(screen.getByRole('switch', { name: 'Âm thanh' }).props.accessibilityState.checked).toBe(true);
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
