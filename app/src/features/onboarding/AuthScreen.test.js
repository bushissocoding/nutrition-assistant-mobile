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

test('shows a confirmation preview after choosing email or SMS recovery', () => {
  const onModeChange = jest.fn();
  const screen = render(<AuthScreen mode="forgot" onModeChange={onModeChange} />);
  fireEvent.press(screen.getByRole('radio', { name: 'Gửi qua SMS' }));
  fireEvent.press(screen.getByRole('button', { name: /Đặt lại mật khẩu/ }));

  expect(onModeChange).toHaveBeenCalledWith('sent');
});
