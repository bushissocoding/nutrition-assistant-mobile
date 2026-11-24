import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import AuthScreen from './AuthScreen';

test('rejects invalid login input before calling the account service', async () => {
  const onSubmit = jest.fn();
  const screen = render(<AuthScreen mode="login" onSubmit={onSubmit} />);
  fireEvent.changeText(screen.getByLabelText('Địa chỉ email'), 'invalid');
  fireEvent.changeText(screen.getByLabelText('Mật khẩu'), 'long-enough');
  fireEvent.press(screen.getByRole('button', { name: 'Đăng nhập' }));
  expect(screen.getByText('Nhập địa chỉ email hợp lệ.')).toBeTruthy();
  expect(onSubmit).not.toHaveBeenCalled();
});

test('passes validated login credentials to the auth service without showing them', async () => {
  const onSubmit = jest.fn().mockResolvedValue({ status: 'authenticated' });
  const screen = render(<AuthScreen mode="login" onSubmit={onSubmit} />);
  fireEvent.changeText(screen.getByLabelText('Địa chỉ email'), 'user@example.com');
  fireEvent.changeText(screen.getByLabelText('Mật khẩu'), 'private-password');
  fireEvent.press(screen.getByRole('button', { name: 'Đăng nhập' }));
  await waitFor(() => expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ mode: 'login', email: 'user@example.com', password: 'private-password' })));
  expect(screen.queryByText('private-password')).toBeNull();
});

test('registration shows email-verification state only after the service confirms account creation', async () => {
  const onSubmit = jest.fn().mockResolvedValue({ status: 'verification-required' });
  const screen = render(<AuthScreen mode="register" onSubmit={onSubmit} />);
  fireEvent.changeText(screen.getByLabelText('Địa chỉ email'), 'user@example.com');
  fireEvent.changeText(screen.getByLabelText('Tên người dùng'), 'patient_1');
  fireEvent.changeText(screen.getByLabelText('Mật khẩu'), 'private-password');
  fireEvent.changeText(screen.getByLabelText('Xác nhận mật khẩu'), 'private-password');
  fireEvent.press(screen.getByRole('button', { name: 'Đăng ký' }));
  await waitFor(() => expect(screen.getByText(/Mở email để xác minh/)).toBeTruthy());
});

test('email recovery uses a generic confirmation and does not claim a message was delivered', async () => {
  const onRecoveryRequest = jest.fn().mockResolvedValue({ status: 'accepted' });
  const onModeChange = jest.fn();
  const screen = render(<AuthScreen mode="forgot" onRecoveryRequest={onRecoveryRequest} onModeChange={onModeChange} />);
  fireEvent.changeText(screen.getByLabelText('Địa chỉ email khôi phục'), 'user@example.com');
  fireEvent.press(screen.getByRole('button', { name: 'Đặt lại mật khẩu' }));
  await waitFor(() => expect(onModeChange).toHaveBeenCalledWith('sent'));
  screen.rerender(<AuthScreen mode="sent" onRecoveryRequest={onRecoveryRequest} onModeChange={onModeChange} />);
  expect(screen.getByText(/Nếu email này khớp với một tài khoản/)).toBeTruthy();
  expect(screen.queryByText(/đã gửi email|không có email/i)).toBeNull();
});

test('SMS recovery verifies the code and new password before returning to login', async () => {
  const onRecoveryRequest = jest.fn().mockResolvedValue({ status: 'accepted' });
  const onRecoveryVerify = jest.fn().mockResolvedValue({ status: 'updated' });
  const onModeChange = jest.fn();
  const screen = render(<AuthScreen mode="forgot" onRecoveryRequest={onRecoveryRequest} onRecoveryVerify={onRecoveryVerify} onModeChange={onModeChange} />);
  fireEvent.press(screen.getByRole('radio', { name: 'Gửi qua SMS' }));
  fireEvent.changeText(screen.getByLabelText('Số điện thoại'), '+84 900 123 456');
  fireEvent.press(screen.getByRole('button', { name: 'Đặt lại mật khẩu' }));
  await waitFor(() => expect(onModeChange).toHaveBeenCalledWith('sms-reset'));
  screen.rerender(<AuthScreen mode="sms-reset" onRecoveryVerify={onRecoveryVerify} onModeChange={onModeChange} />);
  fireEvent.changeText(screen.getByLabelText('Mã xác nhận SMS'), '123456');
  fireEvent.changeText(screen.getByLabelText('Mật khẩu mới'), 'private-password');
  fireEvent.changeText(screen.getByLabelText('Xác nhận mật khẩu mới'), 'private-password');
  fireEvent.press(screen.getByRole('button', { name: 'Xác nhận và đổi mật khẩu' }));
  await waitFor(() => expect(onRecoveryVerify).toHaveBeenCalledWith({ phone: '+84 900 123 456', token: '123456', password: 'private-password', confirmPassword: 'private-password' }));
  expect(onModeChange).toHaveBeenLastCalledWith('login');
});

test('does not claim success when the auth provider is unavailable', async () => {
  const screen = render(<AuthScreen mode="login" />);
  fireEvent.changeText(screen.getByLabelText('Địa chỉ email'), 'user@example.com');
  fireEvent.changeText(screen.getByLabelText('Mật khẩu'), 'private-password');
  fireEvent.press(screen.getByRole('button', { name: 'Đăng nhập' }));
  await waitFor(() => expect(screen.getByText('Dịch vụ tài khoản chưa được cấu hình.')).toBeTruthy());
});
