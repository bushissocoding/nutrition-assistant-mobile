import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import DiaryScreen from './DiaryScreen';
import { api } from '../../services/api';

jest.mock('../../services/api', () => ({
  api: {
    getMealEntries: jest.fn(),
    getFoods: jest.fn(),
    createMealEntry: jest.fn(),
    updateMealEntry: jest.fn(),
    deleteMealEntry: jest.fn(),
  },
}));

const emptyDiary = {
  items: [],
  totals: { energyKcal: 0, proteinG: 0, carbohydrateG: 0, fatG: 0, fiberG: 0, sodiumMg: 0 },
};
const testTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
const savedAtLocalNoon = new Date();
savedAtLocalNoon.setHours(12, 15, 0, 0);
const savedEntry = {
  id: 'entry-1',
  foodId: 'rice-steamed',
  foodName: 'Cơm trắng',
  portion: { amount: 120, unit: 'g' },
  mealType: 'LUNCH',
  consumedAt: savedAtLocalNoon.toISOString(),
  timeZone: testTimeZone,
  notes: null,
  nutrients: { energyKcal: 156, proteinG: 3.2, carbohydrateG: 34, fatG: 0.4, fiberG: 0.5, sodiumMg: 1 },
};
const savedDiary = { items: [savedEntry], totals: savedEntry.nutrients };

beforeEach(() => {
  jest.clearAllMocks();
  api.getMealEntries.mockResolvedValue(emptyDiary);
});

function renderDiary() {
  return render(<DiaryScreen />);
}

async function press(screen, text) {
  await act(async () => {
    fireEvent.press(screen.getByText(text));
    for (let index = 0; index < 3; index += 1) await Promise.resolve();
  });
}

async function changeText(screen, placeholder, value) {
  await act(async () => { fireEvent.changeText(screen.getByPlaceholderText(placeholder), value); });
}

test('shows a finite loading state while the selected day is loading', async () => {
  let finishLoad;
  api.getMealEntries.mockReturnValue(new Promise(resolve => { finishLoad = resolve; }));
  const screen = render(<DiaryScreen />);

  expect(screen.getByText(/Chỉ dùng dữ liệu tổng hợp, không nhập thông tin sức khỏe thật/)).toBeTruthy();
  expect(screen.getByText('Đang tải nhật ký…')).toBeTruthy();
  await act(async () => finishLoad(emptyDiary));
});

test('shows the empty state and lets the user retry a failed day load', async () => {
  api.getMealEntries.mockRejectedValueOnce(new Error('API đang ngoại tuyến.')).mockResolvedValueOnce(emptyDiary);
  const screen = renderDiary();

  await waitFor(() => expect(screen.getByText('API đang ngoại tuyến.')).toBeTruthy());
  await press(screen, 'Thử tải lại');
  await waitFor(() => expect(screen.getByText('Chưa có món nào trong ngày này.')).toBeTruthy());
});

test('ignores a late response for a day the user has already left', async () => {
  let finishPreviousDay;
  const previousDay = new Promise(resolve => { finishPreviousDay = resolve; });
  const nextEntry = { ...savedEntry, id: 'next-day-entry', foodName: 'Món ngày kế tiếp' };
  api.getMealEntries.mockReturnValueOnce(previousDay).mockResolvedValueOnce({ items: [nextEntry], totals: nextEntry.nutrients });
  const screen = renderDiary();

  await act(async () => {
    fireEvent.press(screen.getByLabelText('Ngày sau'));
    for (let index = 0; index < 3; index += 1) await Promise.resolve();
  });
  await waitFor(() => expect(screen.getByText('Món ngày kế tiếp')).toBeTruthy());
  await act(async () => finishPreviousDay({ items: [savedEntry], totals: savedEntry.nutrients }));
  expect(screen.queryByText('Cơm trắng')).toBeNull();
});

test('shows catalog version, food source, units and serving limits in search results', async () => {
  api.getFoods.mockResolvedValue({
    catalog: { version: 'prototype-test-v1', status: 'prototype', notice: 'Demo source values are unreviewed.' },
    items: [{
      id: 'synthetic-food',
      name: 'Synthetic food',
      per100g: { energyKcal: 10 },
      serving: { amount: 50, unit: 'g', household: 'one synthetic piece' },
      nutrition: { basis: { amount: 100, unit: 'g' } },
      source: {
        name: 'USDA FoodData Central',
        edition: 'not-recorded-in-legacy-data',
        sourceRecordId: null,
        license: { name: 'CC0 1.0 Universal' },
      },
    }],
  });
  const screen = renderDiary();

  await press(screen, 'Tìm');
  expect(screen.getByText(/Danh mục prototype-test-v1 · prototype/)).toBeTruthy();
  expect(screen.getByText(/USDA FoodData Central · edition không ghi nhận · CC0 1.0 Universal/)).toBeTruthy();
  await press(screen, 'Synthetic food');
  expect(screen.getByText(/Khẩu phần tham khảo: 50 g · one synthetic piece/)).toBeTruthy();
  expect(screen.getByText(/Dinh dưỡng tính trên 100 g phần ăn được/)).toBeTruthy();
});

test('preserves the form on create failure and retries the same intent with the same key', async () => {
  api.getFoods.mockResolvedValue({ items: [{ id: 'rice-steamed', name: 'Cơm trắng', per100g: { energyKcal: 130 } }] });
  api.createMealEntry.mockRejectedValueOnce(new Error('Không kết nối được API.')).mockResolvedValueOnce({ item: savedEntry });
  api.getMealEntries.mockResolvedValueOnce(emptyDiary).mockResolvedValueOnce(savedDiary);
  const screen = renderDiary();

  await press(screen, 'Tìm');
  await waitFor(() => expect(screen.getByText('Cơm trắng')).toBeTruthy());
  await press(screen, 'Cơm trắng');
  await changeText(screen, 'Khối lượng (g)', '120');
  await changeText(screen, 'Ghi chú (tùy chọn)', 'bữa trưa');
  await press(screen, 'Lưu bữa ăn');

  await waitFor(() => expect(screen.getByText('Không kết nối được API.')).toBeTruthy());
  expect(screen.getByDisplayValue('120')).toBeTruthy();
  expect(screen.getByDisplayValue('bữa trưa')).toBeTruthy();
  expect(screen.queryByText('Đã lưu nhật ký.')).toBeNull();

  await press(screen, 'Thử lưu lại');
  await waitFor(() => expect(api.createMealEntry).toHaveBeenCalledTimes(2));
  const firstAttempt = api.createMealEntry.mock.calls[0];
  const retryAttempt = api.createMealEntry.mock.calls[1];
  expect(retryAttempt).toEqual(firstAttempt);
  expect(retryAttempt[0]).not.toHaveProperty('nutrients');
  expect(firstAttempt[0].consumedAt).toMatch(/(?:Z|[+-]\d{2}:\d{2})$/);
  expect(firstAttempt[0].timeZone).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
  await waitFor(() => expect(screen.getByText('Đã lưu nhật ký.')).toBeTruthy());
  expect(screen.getByText('Đã lưu nhật ký.').props.accessibilityLiveRegion).toBe('polite');
  expect(screen.getByText('156 kcal')).toBeTruthy();
});

test('updates and deletes only after the API confirms each mutation', async () => {
  const updatedEntry = { ...savedEntry, notes: 'đã sửa' };
  api.getMealEntries.mockResolvedValueOnce(savedDiary).mockResolvedValueOnce({ items: [updatedEntry], totals: savedEntry.nutrients }).mockResolvedValueOnce(emptyDiary);
  api.updateMealEntry.mockResolvedValue({ item: updatedEntry });
  api.deleteMealEntry.mockResolvedValue(null);
  let deleteRequest;
  const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
    deleteRequest = buttons.find(button => button.style === 'destructive').onPress();
  });
  const screen = renderDiary();

  await waitFor(() => expect(screen.getByText('Cơm trắng')).toBeTruthy());
  await press(screen, 'Sửa');
  await changeText(screen, 'Ghi chú (tùy chọn)', 'đã sửa');
  await press(screen, 'Lưu thay đổi');
  await waitFor(() => expect(api.updateMealEntry).toHaveBeenCalledWith('entry-1', expect.objectContaining({ notes: 'đã sửa' })));
  await waitFor(() => expect(screen.getByText('đã sửa')).toBeTruthy());

  await act(async () => {
    fireEvent.press(screen.getByText('Xóa'));
    await deleteRequest;
  });
  await waitFor(() => expect(api.deleteMealEntry).toHaveBeenCalledWith('entry-1'));
  await waitFor(() => expect(screen.getByText('Đã xóa bản ghi.').props.accessibilityLiveRegion).toBe('polite'));
  await waitFor(() => expect(screen.getByText('Chưa có món nào trong ngày này.')).toBeTruthy());
  expect(alertSpy).toHaveBeenCalled();
  alertSpy.mockRestore();
});

test('preserves the original instant when editing an entry saved in another time zone', async () => {
  const consumedAt = '2026-11-16T12:15:00.000Z';
  const offsetFor = timeZone => new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'longOffset',
  }).formatToParts(new Date(consumedAt)).find(part => part.type === 'timeZoneName').value;
  const entryTimeZone = ['America/Los_Angeles', 'Pacific/Kiritimati', 'Asia/Tokyo']
    .find(candidate => offsetFor(candidate) !== offsetFor(testTimeZone));
  const entry = { ...savedEntry, consumedAt, timeZone: entryTimeZone };
  api.getMealEntries.mockResolvedValue({ items: [entry], totals: entry.nutrients });
  api.updateMealEntry.mockResolvedValue({ item: entry });
  const screen = renderDiary();

  await waitFor(() => expect(screen.getByText('Cơm trắng')).toBeTruthy());
  await press(screen, 'Sửa');
  await press(screen, 'Lưu thay đổi');

  await waitFor(() => expect(api.updateMealEntry).toHaveBeenCalledTimes(1));
  const [, payload] = api.updateMealEntry.mock.calls[0];
  expect(Date.parse(payload.consumedAt)).toBe(Date.parse(consumedAt));
  expect(payload.timeZone).toBe(testTimeZone);
});
