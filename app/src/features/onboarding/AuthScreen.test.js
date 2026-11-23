import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import AuthScreen from './AuthScreen';

test('keeps authentication as a local preview and does not advance on invalid input', () => {
  const onModeChange = jest.fn();
  const screen = render(<AuthScreen mode="login" onModeChange={onModeChange} />);
  fireEvent.changeText(screen.getByLabelText('Địa chỉ email'), 'invalid');
  fireEvent.changeText(screen.getByLabelText('Mật khẩu'), 'long-enough');
  fireEvent.press(screen.getByRole('button', { name: 'Đăng nhập' }));

  expect(screen.getByText('Nhập địa chỉ email hợp lệ.')).toBeTruthy();
  expect(onModeChange).not.toHaveBeenCalled();
});

test('shows an explicit confirmation preview for email or SMS password recovery', () => {
  const onModeChange = jest.fn();
  const screen = render(<AuthScreen mode="forgot" onModeChange={onModeChange} />);
  fireEvent.press(screen.getByRole('radio', { name: 'Gửi qua SMS' }));
  fireEvent.changeText(screen.getByLabelText('Số điện thoại'), '+84900000000');
  fireEvent.press(screen.getByText('Gửi yêu cầu demo'));

  expect(onModeChange).toHaveBeenCalledWith('sent');
});
