import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import DashboardScreen from './DashboardScreen';
import { api } from '../../services/api';
import { formatLocalDateKey } from '../diary/diary-history.cjs';

jest.mock('../../services/api', () => ({ api: { getMyNutritionReport: jest.fn() } }));

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
  api.getMyNutritionReport.mockImplementation(async query => report(query));
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

test('cycles the chart metric and keeps unknown nutrients distinct', async () => {
  const today = formatLocalDateKey(new Date());
  const screen = render(<DashboardScreen diaryHasEntries diaryTotals={{ proteinG: null, fatG: 40 }} />);

  expect(screen.getAllByText('— g')).toHaveLength(3);
  await waitFor(() => expect(screen.getByLabelText(new RegExp(`Protein ${today}: chưa có dữ liệu dưỡng chất`))).toBeTruthy());
  fireEvent.press(screen.getByRole('button', { name: 'Chỉ số đang xem: Protein' }));
  expect(screen.getByRole('button', { name: 'Chỉ số đang xem: Lipid' })).toBeTruthy();
  expect(screen.getByLabelText(new RegExp(`Lipid ${today}: 40 g`))).toBeTruthy();
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
