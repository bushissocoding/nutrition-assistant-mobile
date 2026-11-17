import React from 'react';
import { render } from '@testing-library/react-native';
import ProfileScreen from './ProfileScreen';

test('labels the locally stored profile as synthetic demo data', () => {
  const screen = render(<ProfileScreen profile={{ mode: 'healthy', age: '30', heightCm: '170', weightKg: '70', allergies: [], redFlags: [] }} />);

  expect(screen.getByText(/HỒ SƠ DEMO/i)).toBeTruthy();
  expect(screen.getByText(/không phải dữ liệu tài khoản/i)).toBeTruthy();
});
