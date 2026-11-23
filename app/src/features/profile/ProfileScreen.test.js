import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import ProfileScreen from './ProfileScreen';

test('labels the locally stored profile as synthetic demo data', () => {
  const screen = render(<ProfileScreen profile={{ mode: 'healthy', age: '30', heightCm: '170', weightKg: '70', allergies: [], redFlags: [] }} />);

  expect(screen.getByText(/HỒ SƠ DEMO/i)).toBeTruthy();
  expect(screen.getByText(/không phải dữ liệu tài khoản/i)).toBeTruthy();
});

test('shows a confirmation sheet before leaving the local demo profile', () => {
  const onExitDemo = jest.fn();
  const screen = render(<ProfileScreen profile={{ mode: 'healthy', allergies: [], redFlags: [] }} onExitDemo={onExitDemo} />);

  fireEvent.press(screen.getByText('Đăng xuất khỏi bản demo'));
  expect(screen.getByText('Bạn có chắc chắn muốn đăng xuất không?')).toBeTruthy();
  expect(onExitDemo).not.toHaveBeenCalled();
  fireEvent.press(screen.getByRole('button', { name: 'Đăng xuất' }));
  expect(onExitDemo).toHaveBeenCalledTimes(1);
});
