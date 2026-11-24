import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import * as Notifications from 'expo-notifications';
import { api } from '../../services/api';
import NotificationsScreen, { notificationGroup } from './NotificationsScreen';

jest.mock('expo-notifications', () => ({
  setNotificationHandler: jest.fn(),
  addNotificationReceivedListener: jest.fn(() => ({ remove: jest.fn() })),
}));
jest.mock('../../services/api', () => ({ api: {
  getMyNotifications: jest.fn(), markMyNotificationRead: jest.fn(), markAllMyNotificationsRead: jest.fn(),
} }));

const items = [
  { id: 'notice-1', kind: 'appointment', title: 'Lịch hẹn có cập nhật', body: 'Mở ứng dụng để xem thông tin mới nhất.', readAt: null, createdAt: new Date().toISOString() },
  { id: 'notice-2', kind: 'payment', title: 'Thanh toán có cập nhật', body: 'Mở ứng dụng để xem thông tin mới nhất.', readAt: '2026-11-23T01:00:00Z', createdAt: '2026-11-23T01:00:00Z' },
];

beforeEach(() => {
  jest.clearAllMocks();
  api.getMyNotifications.mockResolvedValue({ items, pagination: { hasMore: false } });
  api.markMyNotificationRead.mockResolvedValue({ updated: true });
  api.markAllMyNotificationsRead.mockResolvedValue({ updated: true });
});

test('loads persisted account notifications, filters unread state, marks one read, then navigates', async () => {
  const onNavigate = jest.fn();
  const screen = render(<NotificationsScreen accountId="account-1" onNavigate={onNavigate} />);
  expect(await screen.findByText('Lịch hẹn có cập nhật')).toBeTruthy();
  expect(api.getMyNotifications).toHaveBeenCalledWith({ limit: 50, offset: 0, unread: false });
  fireEvent.press(screen.getByRole('checkbox', { name: 'Chỉ xem tin mới' }));
  expect(screen.getByText('Lịch hẹn có cập nhật')).toBeTruthy();
  expect(screen.queryByText('Thanh toán có cập nhật')).toBeNull();
  fireEvent.press(screen.getByRole('button', { name: /Lịch hẹn có cập nhật/ }));
  await waitFor(() => expect(api.markMyNotificationRead).toHaveBeenCalledWith('notice-1'));
  await waitFor(() => expect(onNavigate).toHaveBeenCalledWith('appointments-list'));
  expect(screen.getByText('Không còn thông báo chưa đọc')).toBeTruthy();
  expect(Notifications.addNotificationReceivedListener).toHaveBeenCalledTimes(1);
});

test('marks every notice read through the account API', async () => {
  const screen = render(<NotificationsScreen accountId="account-1" />);
  expect(await screen.findByText('Lịch hẹn có cập nhật')).toBeTruthy();
  fireEvent.press(screen.getByRole('checkbox', { name: 'Chỉ xem tin mới' }));
  fireEvent.press(screen.getByText('Đánh dấu đã đọc'));
  await waitFor(() => expect(api.markAllMyNotificationsRead).toHaveBeenCalledTimes(1));
  expect(screen.getByText('Không còn thông báo chưa đọc')).toBeTruthy();
});

test('shows a retry state when notification loading fails', async () => {
  api.getMyNotifications.mockRejectedValueOnce(new Error('API is unavailable'));
  const screen = render(<NotificationsScreen accountId="account-1" />);
  expect(await screen.findByText('API is unavailable')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'Thử tải lại' }));
  await waitFor(() => expect(api.getMyNotifications).toHaveBeenCalledTimes(2));
});

test('groups account notices by local calendar date', () => {
  const now = new Date('2026-11-24T12:00:00');
  expect(notificationGroup('2026-11-24T00:01:00', now)).toBe('today');
  expect(notificationGroup('2026-11-23T12:00:00', now)).toBe('yesterday');
  expect(notificationGroup('2026-11-19T12:00:00', now)).toBe('week');
  expect(notificationGroup('2026-11-10T12:00:00', now)).toBe('older');
});
