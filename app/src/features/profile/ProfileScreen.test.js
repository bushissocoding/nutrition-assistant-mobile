import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { Modal } from 'react-native';
import ProfileScreen from './ProfileScreen';

test('shows the username as the signed-in account and keeps health profile details off this page', () => {
  const screen = render(<ProfileScreen
    account={{ username: 'Gia Khang', email: 'khang@example.test', phone: '+84901234567' }}
    profile={{ username: 'Gia Khang', mode: 'healthy', age: 16, heightCm: '170', weightKg: '70', allergies: ['cá'], redFlags: [] }}
  />);

  expect(screen.getByRole('header', { name: 'Cá nhân' })).toBeTruthy();
  expect(screen.getByText('Gia Khang')).toBeTruthy();
  expect(screen.getAllByText('Gia Khang')).toHaveLength(1);
  expect(screen.getByText('khang@example.test')).toBeTruthy();
  expect(screen.queryByText('Tài khoản đã đăng nhập')).toBeNull();
  expect(screen.queryByText('Tuổi')).toBeNull();
  expect(screen.queryByText('Chiều cao')).toBeNull();
  expect(screen.queryByText('Dị ứng / cần tránh')).toBeNull();
  expect(screen.queryByRole('button', { name: /Chỉnh sửa hồ sơ/ })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Thông báo' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Thoát về màn chào mừng' })).toBeNull();
});

test('opens the personal details page from its menu row', () => {
  const screen = render(<ProfileScreen
    account={{ username: 'Gia Khang', email: 'khang@example.test', phone: '+84901234567' }}
    profile={{ username: 'Gia Khang', mode: 'healthy', age: 16, dateOfBirth: null, allergies: [], redFlags: [] }}
  />);

  fireEvent.press(screen.getByRole('button', { name: 'Thông tin cá nhân' }));
  expect(screen.getByText('Thông tin cá nhân')).toBeTruthy();
  expect(screen.getByText('+84901234567')).toBeTruthy();
  expect(screen.getByText('khang@example.test')).toBeTruthy();
  expect(screen.getByText('Chưa cung cấp')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Cập nhật' })).toBeTruthy();
});

test('opens the profile payment methods screen from its menu row', () => {
  const onNavigate = jest.fn();
  const screen = render(<ProfileScreen profile={{ username: 'Khang' }} onNavigate={onNavigate} />);

  fireEvent.press(screen.getByRole('button', { name: 'Phương thức thanh toán' }));

  expect(onNavigate).toHaveBeenCalledWith('profile-payment-methods');
});

test('renders logout confirmation in a native modal above the app navigation', () => {
  const onExitDemo = jest.fn();
  const screen = render(<ProfileScreen profile={{ username: 'Khang' }} onExitDemo={onExitDemo} />);

  fireEvent.press(screen.getByRole('button', { name: 'Đăng xuất' }));
  expect(screen.getByText('Bạn có chắc chắn muốn đăng xuất không?')).toBeTruthy();
  expect(screen.getByTestId('logout-confirmation-modal')).toBeTruthy();
  expect(screen.UNSAFE_getByType(Modal).props.visible).toBe(true);
  expect(onExitDemo).not.toHaveBeenCalled();
  fireEvent.press(screen.getAllByRole('button', { name: 'Đăng xuất' }).at(-1));
  expect(onExitDemo).toHaveBeenCalledTimes(1);
});
