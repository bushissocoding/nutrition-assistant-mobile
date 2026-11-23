import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import NotificationsScreen from './NotificationsScreen';

test('filters unread notices and marks a selected notice as read before navigating', () => {
  const onNavigate = jest.fn();
  const screen = render(<NotificationsScreen onNavigate={onNavigate} />);
  fireEvent.press(screen.getByRole('tab', { name: 'Chưa đọc' }));
  expect(screen.getByText('Lịch hẹn đã đặt')).toBeTruthy();
  expect(screen.queryByText('Ghi chú bữa ăn')).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: /Lịch hẹn đã đặt/ }));
  expect(onNavigate).toHaveBeenCalledWith('appointments');
  expect(screen.getByText('1 thông báo chưa đọc')).toBeTruthy();
});
