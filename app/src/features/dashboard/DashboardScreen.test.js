import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import DashboardScreen from './DashboardScreen';
import { api } from '../../services/api';
import { getRecentLocalDays } from '../diary/diary-history.cjs';

jest.mock('../../services/api', () => ({ api: { getMealEntries: jest.fn() } }));

function response(date, overrides = {}) {
  return {
    date,
    items: [],
    totals: { energyKcal: 0, proteinG: 0, carbohydrateG: 0, fatG: 0, fiberG: 0, sodiumMg: 0, ...overrides },
  };
}

beforeEach(() => {
  api.getMealEntries.mockReset();
  api.getMealEntries.mockImplementation(async ({ date }) => response(date));
});

test('shows today report values and seven daily API totals', async () => {
  const screen = render(<DashboardScreen diary={[{ id: 'entry-1' }]} diaryTotals={{ proteinG: 62, fatG: 40, fiberG: 32, carbohydrateG: 180, energyKcal: 1550 }} />);

  expect(screen.getByText('62 g')).toBeTruthy();
  expect(screen.getByText('40 g')).toBeTruthy();
  expect(screen.getByText('32 g')).toBeTruthy();
  expect(screen.getByText('180 g')).toBeTruthy();
  expect(screen.getByText('1550 kcal')).toBeTruthy();
  expect(screen.getByText('1 món đã ghi')).toBeTruthy();
  await waitFor(() => expect(screen.getAllByLabelText(/Protein \d{4}-\d\d-\d\d: \d+ g/)).toHaveLength(7));
  expect(api.getMealEntries).toHaveBeenCalledTimes(6);
  expect(api.getMealEntries).toHaveBeenCalledWith(expect.objectContaining({
    date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
    timeZone: expect.any(String),
  }));
});

test('cycles the seven-day chart metric and labels values by local date', async () => {
  const screen = render(<DashboardScreen diaryTotals={{ proteinG: 62, fatG: 40 }} />);

  expect(screen.getByRole('button', { name: 'Chỉ số đang xem: Protein' })).toBeTruthy();
  await waitFor(() => expect(screen.getAllByLabelText(/Protein \d{4}-\d\d-\d\d: \d+ g/)).toHaveLength(7));
  fireEvent.press(screen.getByRole('button', { name: 'Chỉ số đang xem: Protein' }));
  expect(screen.getByRole('button', { name: 'Chỉ số đang xem: Lipid' })).toBeTruthy();
  expect(screen.getAllByLabelText(/Lipid \d{4}-\d\d-\d\d: \d+ g/)).toHaveLength(7);
});

test('keeps successful days visible when one history date fails and retries the chart', async () => {
  const days = getRecentLocalDays(new Date(), 7);
  const failedDate = days[1].date;
  api.getMealEntries.mockImplementation(async ({ date }) => {
    if (date === failedDate) throw new Error('API đang ngoại tuyến.');
    return { ...response(date, { proteinG: 23 }), items: [{ id: `entry-${date}` }] };
  });
  const screen = render(<DashboardScreen />);

  await waitFor(() => expect(screen.getByText(/Không tải được dữ liệu của 1 ngày/)).toBeTruthy());
  expect(screen.getAllByLabelText(/Protein \d{4}-\d\d-\d\d: \d+ g/)).toHaveLength(6);
  expect(screen.getAllByTestId('chart-unavailable')).toHaveLength(1);
  api.getMealEntries.mockImplementation(async ({ date }) => ({ ...response(date, { proteinG: 23 }), items: [{ id: `entry-${date}` }] }));
  fireEvent.press(screen.getByRole('button', { name: 'Tải lại lịch sử' }));
  await waitFor(() => expect(screen.queryByText(/Không tải được dữ liệu/)).toBeNull());
  expect(screen.getAllByLabelText(/Protein \d{4}-\d\d-\d\d: \d+ g/)).toHaveLength(7);
});

test('shows an explicit empty-history state when all seven days have no entries', async () => {
  const screen = render(<DashboardScreen />);

  await waitFor(() => expect(screen.getByText(/Chưa có món ăn nào được ghi trong 7 ngày gần nhất/)).toBeTruthy());
  expect(screen.getAllByLabelText(/Protein \d{4}-\d\d-\d\d: 0 g/)).toHaveLength(7);
  expect(screen.queryAllByTestId('chart-bar')).toHaveLength(0);
});
