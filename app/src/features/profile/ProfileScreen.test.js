import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import ProfileScreen from './ProfileScreen';

test('labels profile as account data and retains the non-clinical boundary', () => {
  const screen = render(<ProfileScreen account={{ email: 'user@example.test' }} profile={{ mode: 'healthy', age: '30', heightCm: '170', weightKg: '70', allergies: [], redFlags: [] }} />);

  expect(screen.getAllByText('user@example.test').length).toBeGreaterThan(0);
  expect(screen.getByText(/HỒ SƠ TÀI KHOẢN/i)).toBeTruthy();
  expect(screen.getAllByText(/chưa được nhân viên y tế xác minh/i).length).toBeGreaterThan(0);
});

test('shows a confirmation sheet before leaving the local demo profile', () => {
  const onExitDemo = jest.fn();
  const screen = render(<ProfileScreen profile={{ mode: 'healthy', allergies: [], redFlags: [] }} onExitDemo={onExitDemo} />);

  fireEvent.press(screen.getByText('Đăng xuất'));
  expect(screen.getByText('Bạn có chắc chắn muốn đăng xuất không?')).toBeTruthy();
  expect(onExitDemo).not.toHaveBeenCalled();
  fireEvent.press(screen.getAllByRole('button', { name: 'Đăng xuất' }).at(-1));
  expect(onExitDemo).toHaveBeenCalledTimes(1);
});
