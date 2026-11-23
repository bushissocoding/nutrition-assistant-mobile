import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
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

test('help questions expand to show the prototype service boundary', () => {
  const screen = render(<SettingsScreen screen="settings-help" />);
  fireEvent.press(screen.getByText('Ứng dụng có tư vấn y tế không?'));
  expect(screen.getByText(/không chẩn đoán hoặc điều trị/i)).toBeTruthy();
});
