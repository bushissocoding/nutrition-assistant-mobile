import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import DashboardScreen from './DashboardScreen';
import { api } from '../../services/api';
import { formatLocalDateKey, getRecentLocalDays } from '../diary/diary-history.cjs';

jest.mock('../../services/api', () => ({ api: { getMyNutritionReport: jest.fn(), getMyPersonalization: jest.fn() } }));

function report({ date, days = 6, hasEntries = false, overrides = {} }) {
  const last = new Date(`${date}T12:00:00`);
  const dates = Array.from({ length: days }, (_, index) => {
    const day = new Date(last);
    day.setDate(last.getDate() - (days - index - 1));
    return formatLocalDateKey(day);
  });
  return { days: dates.map(key => ({
    date: key,
    hasEntries,
    totals: hasEntries ? { energyKcal: 0, proteinG: 0, carbohydrateG: 0, fatG: 0, fiberG: 0, sodiumMg: 0, ...overrides } : null,
  })) };
}

beforeEach(() => {
  api.getMyNutritionReport.mockReset();
  api.getMyPersonalization.mockReset();
  api.getMyPersonalization.mockResolvedValue({ preferences: { trackConfirmedTargets: false } });
  api.getMyNutritionReport.mockImplementation(async query => report(query));
});

test('shows user-entered ranges only when confirmed targets are enabled for a confirmed patient profile', async () => {
  api.getMyPersonalization.mockResolvedValue({ preferences: { trackConfirmedTargets: true } });
  const profile = { mode: 'patient', medicalLimitsConfirmed: true, hardLimits: { proteinG: { min: 50, max: 90 }, sodiumMg: { max: 2000 } } };
  const screen = render(<DashboardScreen profile={profile} diaryHasEntries diaryTotals={{ proteinG: 62, sodiumMg: 2300 }} />);

  expect(await screen.findByText('Đối chiếu giới hạn đã xác nhận')).toBeTruthy();
  expect(screen.getAllByText('62 g')).toHaveLength(2);
  expect(screen.getByText(/Khoảng: 50–90 g · Trong khoảng bạn nhập/)).toBeTruthy();
  expect(screen.getByText(/Khoảng: Tối đa 2000 mg · Ngoài khoảng bạn nhập/)).toBeTruthy();
  expect(screen.getByText(/không phải đánh giá y tế/)).toBeTruthy();
});

test('does not show confirmed target ranges for healthy or unconfirmed profiles', async () => {
  api.getMyPersonalization.mockResolvedValue({ preferences: { trackConfirmedTargets: true } });
  const screen = render(<DashboardScreen profile={{ mode: 'patient', medicalLimitsConfirmed: false, hardLimits: { proteinG: { max: 70 } } }} />);
  await waitFor(() => expect(api.getMyPersonalization).toHaveBeenCalled());
  expect(screen.queryByText('Đối chiếu giới hạn đã xác nhận')).toBeNull();
});

test('shows today report values and loads a bounded account nutrition report', async () => {
  const today = formatLocalDateKey(new Date());
  const screen = render(<DashboardScreen diary={[{ id: 'entry-1' }]} diaryHasEntries diaryTotals={{ proteinG: 62, fatG: 40, fiberG: 32, carbohydrateG: 180, energyKcal: 1550 }} />);

  expect(screen.getByText('62 g')).toBeTruthy();
  expect(screen.getByText('40 g')).toBeTruthy();
  expect(screen.getByText('32 g')).toBeTruthy();
  expect(screen.getByText('180 g')).toBeTruthy();
  expect(screen.getByText('1550 kcal')).toBeTruthy();
  expect(screen.getByText('1 món đã ghi')).toBeTruthy();
  await waitFor(() => expect(screen.getByLabelText(new RegExp(`Protein ${today}: 62 g`))).toBeTruthy());
  expect(api.getMyNutritionReport).toHaveBeenCalledTimes(1);
  expect(api.getMyNutritionReport).toHaveBeenCalledWith(expect.objectContaining({
    date: expect.stringMatching(/^\d{4}-\d\d-\d\d$/),
    timeZone: expect.any(String),
    days: 6,
  }));
});

test('opens the five-metric list and keeps unknown nutrients distinct', async () => {
  const today = formatLocalDateKey(new Date());
  const screen = render(<DashboardScreen diaryHasEntries diaryTotals={{ proteinG: null, fatG: 40 }} />);

  expect(screen.getAllByText('— g')).toHaveLength(3);
  await waitFor(() => expect(screen.getByLabelText(new RegExp(`Protein ${today}: chưa có dữ liệu dưỡng chất`))).toBeTruthy());
  fireEvent.press(screen.getByRole('button', { name: 'Chỉ số đang xem: Protein' }));
  expect(screen.getByRole('button', { name: 'Protein' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Lipid' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Chất xơ' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Glucid' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Năng lượng' })).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'Lipid' }));
  expect(screen.getByRole('button', { name: 'Chỉ số đang xem: Lipid' })).toBeTruthy();
  expect(screen.getByLabelText(new RegExp(`Lipid ${today}: 40 g`))).toBeTruthy();
});

test('opens the seven-day date list and updates the report cards for a selected day', async () => {
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayLabel = new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(yesterday);
  api.getMyNutritionReport.mockImplementation(async query => report({ ...query, hasEntries: true, overrides: { proteinG: 18, fatG: 11 } }));
  const screen = render(<DashboardScreen diaryHasEntries diaryTotals={{ proteinG: 62, fatG: 40 }} />);

  expect(screen.getByText('62 g')).toBeTruthy();
  await waitFor(() => expect(api.getMyNutritionReport).toHaveBeenCalled());
  fireEvent.press(screen.getByRole('button', { name: 'Chọn ngày báo cáo: Hôm nay' }));
  getRecentLocalDays(today, 7).forEach(day => {
    const label = new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(day.dateObject);
    expect(screen.getByRole('button', { name: day.current ? `Hôm nay · ${label}` : label })).toBeTruthy();
  });
  fireEvent.press(screen.getByRole('button', { name: yesterdayLabel }));

  await waitFor(() => expect(screen.getByText('18 g')).toBeTruthy());
  expect(screen.getByRole('button', { name: `Chọn ngày báo cáo: ${yesterdayLabel}` })).toBeTruthy();
});

test('shows a failed account report and retries the complete history request', async () => {
  api.getMyNutritionReport.mockRejectedValueOnce(new Error('API đang ngoại tuyến.'));
  const screen = render(<DashboardScreen />);

  await waitFor(() => expect(screen.getByText(/Không tải được dữ liệu của 6 ngày/)).toBeTruthy());
  expect(screen.getAllByTestId('chart-unavailable')).toHaveLength(6);
  api.getMyNutritionReport.mockImplementation(async query => report({ ...query, hasEntries: true, overrides: { proteinG: 23 } }));
  fireEvent.press(screen.getByRole('button', { name: 'Tải lại lịch sử' }));
  await waitFor(() => expect(screen.queryByText(/Không tải được dữ liệu/)).toBeNull());
  expect(api.getMyNutritionReport).toHaveBeenCalledTimes(2);
});

test('shows an explicit empty-history state and no fabricated nutrient values', async () => {
  const screen = render(<DashboardScreen />);

  await waitFor(() => expect(screen.getByText(/Chưa có món ăn nào được ghi trong 7 ngày gần nhất/)).toBeTruthy());
  expect(screen.getAllByLabelText(/Protein \d{4}-\d\d-\d\d: chưa ghi món/)).toHaveLength(7);
  expect(screen.getAllByText('— g')).toHaveLength(4);
  expect(screen.queryAllByTestId('chart-bar')).toHaveLength(0);
});
