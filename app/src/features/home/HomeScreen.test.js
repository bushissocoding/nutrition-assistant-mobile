import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import HomeScreen from './HomeScreen';
import { api } from '../../services/api';
import { formatLocalDateKey, getLocalWeek } from '../diary/diary-history.cjs';

jest.mock('../../services/api', () => ({ api: { getMyMealEntries: jest.fn() } }));

const totals = { energyKcal: 195, proteinG: 9, carbohydrateG: 22, fatG: 4, fiberG: 3, sodiumMg: 100 };

beforeEach(() => {
  api.getMyMealEntries.mockReset();
  api.getMyMealEntries.mockImplementation(async ({ date }) => ({ date, items: [], hasEntries: false, totals: null }));
});

test('shows the eight designed shortcuts and routes them to their matching features', () => {
  const onNavigate = jest.fn();
  const screen = render(<HomeScreen onNavigate={onNavigate} />);

  expect(screen.getByRole('button', { name: 'Đặt khám' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Lịch hẹn' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Hồ sơ y tế' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Thực đơn' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Nhật ký' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Đi chợ' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Cá nhân hóa' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Hướng dẫn' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Bác sĩ' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Báo cáo' })).toBeNull();
  expect(StyleSheet.flatten(screen.getByLabelText('Tìm món ăn và ghi nhật ký').props.style).flex).toBe(1);
  expect(screen.getByRole('button', { name: 'Mở báo cáo tổng quát' })).toBeTruthy();
  expect(screen.getByText('▥')).toBeTruthy();

  fireEvent.press(screen.getByRole('button', { name: 'Đi chợ' }));
  expect(onNavigate).toHaveBeenCalledWith('grocery');
});

test('opens the help center from the Home guide shortcut', () => {
  const onNavigate = jest.fn();
  const screen = render(<HomeScreen onNavigate={onNavigate} />);

  fireEvent.press(screen.getByRole('button', { name: 'Hướng dẫn' }));
  expect(onNavigate).toHaveBeenCalledWith('settings-help');
});

test('keeps the month day selector visible on Home with a bounded horizontal strip', () => {
  const screen = render(<HomeScreen onNavigate={jest.fn()} />);
  const today = new Date();
  const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'short' }).format(today);
  const dayStrip = screen.UNSAFE_getByProps({ accessibilityLabel: 'Các ngày trong tháng' });

  expect(StyleSheet.flatten(dayStrip.props.style)).toMatchObject({ height: 72, flexGrow: 0, flexShrink: 0 });
  expect(screen.getByRole('tab', { name: `${weekday} ${today.getDate()}` })).toBeTruthy();
});

test('opens account-bounded month options and changes Home month without navigating away', () => {
  const onNavigate = jest.fn();
  const screen = render(<HomeScreen onNavigate={onNavigate} account={{ createdAt: '2024-03-18T08:30:00.000Z' }} />);
  const currentDate = new Date();
  const currentLabel = `${new Intl.DateTimeFormat('en-US', { month: 'short' }).format(currentDate)}-${currentDate.getFullYear()}`;

  expect(screen.getByText(currentLabel)).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'Tháng đang chọn' }));
  expect(screen.getByRole('button', { name: 'Mar-2024' })).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Feb-2024' })).toBeNull();

  fireEvent.press(screen.getByRole('button', { name: 'Mar-2024' }));
  expect(screen.getByText('Mar-2024')).toBeTruthy();
  expect(screen.getByRole('tab', { name: 'Mon 18' })).toBeTruthy();
  expect(screen.queryByRole('tab', { name: 'Sun 17' })).toBeNull();
  expect(onNavigate).not.toHaveBeenCalled();
});

test('uses the signed-in profile name instead of a fixed sample identity', () => {
  const screen = render(<HomeScreen onNavigate={jest.fn()} profile={{ username: 'Linh Nguyen' }} account={{ email: 'sample@example.test' }} />);
  expect(screen.getByText('Linh Nguyen')).toBeTruthy();
  expect(screen.queryByText('Kiên Phạm')).toBeNull();
  expect(screen.queryByText('Thực đơn demo đã sẵn sàng')).toBeNull();
});

test('loads the selected local calendar date and shows its API diary response', async () => {
  const screen = render(<HomeScreen onNavigate={jest.fn()} diary={[
    { id: 'meal-1', mealType: 'BREAKFAST', foodName: 'Cơm gạo lứt', nutrients: { energyKcal: 195 } },
  ]} />);

  expect(screen.getByText('Cơm gạo lứt')).toBeTruthy();
  expect(screen.getByText('195 kcal')).toBeTruthy();
  expect(screen.getAllByText('Chưa ghi món ăn')).toHaveLength(2);

  const now = new Date();
  const target = getLocalWeek(now).find(day => day.date !== formatLocalDateKey(now));
  api.getMyMealEntries.mockResolvedValueOnce({ date: target.date, hasEntries: true, items: [
    { id: 'history-entry', mealType: 'LUNCH', foodName: 'Canh bí đỏ', nutrients: { energyKcal: 85 } },
  ], totals });
  fireEvent.press(screen.getByRole('tab', { name: `${target.label} ${target.dateObject.getDate()}` }));

  await waitFor(() => expect(screen.getByText('Canh bí đỏ')).toBeTruthy());
  expect(screen.getByText('85 kcal')).toBeTruthy();
  expect(api.getMyMealEntries).toHaveBeenCalledWith({ date: target.date, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC' });
});

test('shows an error instead of empty state and retries the selected historical date', async () => {
  const screen = render(<HomeScreen onNavigate={jest.fn()} />);
  const now = new Date();
  const target = getLocalWeek(now).find(day => day.date !== formatLocalDateKey(now));
  api.getMyMealEntries.mockRejectedValueOnce(new Error('API đang ngoại tuyến.'));
  fireEvent.press(screen.getByRole('tab', { name: `${target.label} ${target.dateObject.getDate()}` }));

  await waitFor(() => expect(screen.getByText(new RegExp(`Không tải được nhật ký ngày ${target.date}`))).toBeTruthy());
  api.getMyMealEntries.mockResolvedValueOnce({ date: target.date, hasEntries: true, items: [
    { id: 'retry-entry', mealType: 'DINNER', foodName: 'Đậu hũ sốt cà', nutrients: { energyKcal: 120 } },
  ], totals });
  fireEvent.press(screen.getByRole('button', { name: 'Thử lại' }));
  await waitFor(() => expect(screen.getByText('Đậu hũ sốt cà')).toBeTruthy());
});

test('ignores a late response after the user selects a different calendar day', async () => {
  const now = new Date();
  const targets = getLocalWeek(now).filter(day => day.date !== formatLocalDateKey(now)).slice(0, 2);
  let resolveFirst;
  api.getMyMealEntries.mockImplementationOnce(() => new Promise(resolve => { resolveFirst = resolve; }))
    .mockImplementationOnce(async ({ date }) => ({ date, items: [
      { id: 'newest-entry', mealType: 'LUNCH', foodName: 'Ngày vừa chọn', nutrients: { energyKcal: 110 } },
    ], totals }));
  const screen = render(<HomeScreen onNavigate={jest.fn()} />);

  fireEvent.press(screen.getByRole('tab', { name: `${targets[0].label} ${targets[0].dateObject.getDate()}` }));
  fireEvent.press(screen.getByRole('tab', { name: `${targets[1].label} ${targets[1].dateObject.getDate()}` }));
  await waitFor(() => expect(screen.getByText('Ngày vừa chọn')).toBeTruthy());

  resolveFirst({ date: targets[0].date, hasEntries: true, items: [
    { id: 'stale-entry', mealType: 'LUNCH', foodName: 'Ngày cũ', nutrients: { energyKcal: 90 } },
  ], totals });
  await waitFor(() => expect(screen.queryByText('Ngày cũ')).toBeNull());
  expect(screen.getByText('Ngày vừa chọn')).toBeTruthy();
});
