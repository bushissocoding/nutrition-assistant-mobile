import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import NotificationsScreen, { initialNotificationItems } from './NotificationsScreen';

test('filters unread notices and marks a selected notice as read before navigating', () => {
  const onNavigate = jest.fn();
  const screen = render(<NotificationsScreen onNavigate={onNavigate} />);
  fireEvent.press(screen.getByRole('checkbox', { name: 'Chỉ xem tin mới' }));
  expect(screen.getByText('Lịch hẹn đã đặt')).toBeTruthy();
  expect(screen.queryByText('Ghi chú bữa ăn')).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: /Lịch hẹn đã đặt/ }));
  expect(onNavigate).toHaveBeenCalledWith('appointments-list');
  expect(screen.getAllByRole('button', { name: /Chưa đọc/ })).toHaveLength(1);
});

test('keeps a read notification when the screen is reopened by its owner', () => {
  let items = initialNotificationItems;
  const onItemsChange = update => { items = update(items); };
  const firstScreen = render(<NotificationsScreen items={items} onItemsChange={onItemsChange} />);

  fireEvent.press(firstScreen.getByRole('button', { name: /Lịch hẹn đã đặt/ }));
  expect(items.find(item => item.id === 'visit').unread).toBe(false);
  firstScreen.unmount();

  const reopenedScreen = render(<NotificationsScreen items={items} onItemsChange={onItemsChange} />);
  expect(reopenedScreen.getByRole('button', { name: /Lịch hẹn đã đặt.*Đã đọc/ })).toBeTruthy();
  expect(reopenedScreen.getByRole('button', { name: /Thay đổi lịch hẹn.*Chưa đọc/ })).toBeTruthy();
});
