import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import DiaryScreen from './DiaryScreen';
import { api } from '../../services/api';

jest.mock('../../services/api', () => ({
  api: {
    getMyMealEntries: jest.fn(),
    searchSourcedFoods: jest.fn(),
    createMyMealEntry: jest.fn(),
    updateMyMealEntry: jest.fn(),
    deleteMyMealEntry: jest.fn(),
  },
}));

const emptyDiary = {
  items: [],
  hasEntries: false,
  totals: null,
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
const savedDiary = { items: [savedEntry], hasEntries: true, totals: savedEntry.nutrients };

beforeEach(() => {
  jest.clearAllMocks();
  api.getMyMealEntries.mockResolvedValue(emptyDiary);
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

async function pressLabel(screen, label) {
  await act(async () => {
    fireEvent.press(screen.getByLabelText(label));
    for (let index = 0; index < 3; index += 1) await Promise.resolve();
  });
}

async function openAddFood(screen) {
  await press(screen, '＋ Thêm món');
}

async function changeText(screen, placeholder, value) {
  await act(async () => { fireEvent.changeText(screen.getByPlaceholderText(placeholder), value); });
}

test('shows a finite loading state while the selected day is loading', async () => {
  let finishLoad;
  api.getMyMealEntries.mockReturnValue(new Promise(resolve => { finishLoad = resolve; }));
  const screen = render(<DiaryScreen />);

  expect(screen.getByText(/Nhật ký được lưu trong tài khoản và chỉ hiển thị cho bạn/)).toBeTruthy();
  expect(screen.getByText('Đang tải nhật ký…')).toBeTruthy();
  await act(async () => finishLoad(emptyDiary));
});

test('shows the empty state and lets the user retry a failed day load', async () => {
  api.getMyMealEntries.mockRejectedValueOnce(new Error('API đang ngoại tuyến.')).mockResolvedValueOnce(emptyDiary);
  const screen = renderDiary();

  await waitFor(() => expect(screen.getByText('API đang ngoại tuyến.')).toBeTruthy());
  await press(screen, 'Thử tải lại');
  await waitFor(() => expect(screen.getByText('Chưa có món nào trong ngày này.')).toBeTruthy());
});

test('ignores a late response for a day the user has already left', async () => {
  let finishPreviousDay;
  const previousDay = new Promise(resolve => { finishPreviousDay = resolve; });
  const nextEntry = { ...savedEntry, id: 'next-day-entry', foodName: 'Món ngày kế tiếp' };
  api.getMyMealEntries.mockReturnValueOnce(previousDay).mockResolvedValueOnce({ items: [nextEntry], hasEntries: true, totals: nextEntry.nutrients });
  const screen = renderDiary();

  await act(async () => {
    fireEvent.press(screen.getByLabelText('Ngày sau'));
    for (let index = 0; index < 3; index += 1) await Promise.resolve();
  });
  await waitFor(() => expect(screen.getByText('Món ngày kế tiếp')).toBeTruthy());
  await act(async () => finishPreviousDay({ items: [savedEntry], hasEntries: true, totals: savedEntry.nutrients }));
  expect(screen.queryByText('Cơm trắng')).toBeNull();
});

test('loads the selected date from the visible week strip', async () => {
  const today = new Date();
  const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1, 12);
  const pad = value => String(value).padStart(2, '0');
  const targetDate = `${tomorrow.getFullYear()}-${pad(tomorrow.getMonth() + 1)}-${pad(tomorrow.getDate())}`;
  const label = `Chọn ${new Intl.DateTimeFormat('vi-VN', { weekday: 'long', day: 'numeric', month: 'long' }).format(tomorrow)}`;
  const screen = renderDiary();

  await act(async () => {
    fireEvent.press(screen.getByLabelText(label));
    for (let index = 0; index < 3; index += 1) await Promise.resolve();
  });

  await waitFor(() => expect(api.getMyMealEntries).toHaveBeenLastCalledWith({ date: targetDate, timeZone: testTimeZone }));
});

test('shows catalog version, food source, units and serving limits in search results', async () => {
  api.searchSourcedFoods.mockResolvedValue({
    catalogVersion: 'synthetic-test-v1',
    items: [{
      id: 'synthetic-test-source:12345',
      name: 'Synthetic food',
      recordId: '12345',
      nutrition: { values: { energyKcal: { value: 10 } } },
      basis: { amount: 100, unit: 'g' },
      source: {
        label: 'Nguồn thử nghiệm',
        edition: '2025-04-01',
        recordId: '12345',
      },
    }],
  });
  const screen = renderDiary();

  await openAddFood(screen);
  await pressLabel(screen, 'Tìm thực phẩm');
  expect(screen.getByText(/Danh mục synthetic-test-v1 · live/)).toBeTruthy();
  expect(screen.getByText(/Nguồn thử nghiệm · #12345 · edition 2025-04-01/)).toBeTruthy();
  await press(screen, 'Synthetic food');
  await press(screen, 'Xem khẩu phần (1) →');
  expect(screen.getByText(/Dữ liệu nguồn theo 100 g/)).toBeTruthy();
});

test('preserves the form on create failure and retries the same intent with the same key', async () => {
  api.searchSourcedFoods.mockResolvedValue({ items: [{ id: 'synthetic-test-source:12345', name: 'Cơm trắng', nutrition: { values: { energyKcal: { value: 130 } } } }] });
  api.createMyMealEntry.mockRejectedValueOnce(new Error('Không kết nối được API.')).mockResolvedValueOnce({ item: savedEntry });
  api.getMyMealEntries.mockResolvedValueOnce(emptyDiary).mockResolvedValueOnce(savedDiary);
  const screen = renderDiary();

  await openAddFood(screen);
  await pressLabel(screen, 'Tìm thực phẩm');
  await waitFor(() => expect(screen.getByText('Cơm trắng')).toBeTruthy());
  await press(screen, 'Cơm trắng');
  await press(screen, 'Xem khẩu phần (1) →');
  await changeText(screen, 'Khối lượng (g)', '120');
  await changeText(screen, 'Ghi chú (tùy chọn)', 'bữa trưa');
  await press(screen, '⊕ Xác nhận thêm vào bữa');

  await waitFor(() => expect(screen.getByText('Không kết nối được API.')).toBeTruthy());
  expect(screen.getByDisplayValue('120')).toBeTruthy();
  expect(screen.getByDisplayValue('bữa trưa')).toBeTruthy();
  expect(screen.queryByText('Đã lưu nhật ký.')).toBeNull();

  await press(screen, 'Thử lưu lại');
  await waitFor(() => expect(api.createMyMealEntry).toHaveBeenCalledTimes(2));
  const firstAttempt = api.createMyMealEntry.mock.calls[0];
  const retryAttempt = api.createMyMealEntry.mock.calls[1];
  expect(retryAttempt).toEqual(firstAttempt);
  expect(retryAttempt[0]).not.toHaveProperty('nutrients');
  expect(firstAttempt[0].consumedAt).toMatch(/(?:Z|[+-]\d{2}:\d{2})$/);
  expect(firstAttempt[0].timeZone).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
  await waitFor(() => expect(screen.getByText('Đã lưu nhật ký.')).toBeTruthy());
  expect(screen.getByText('Đã lưu nhật ký.').props.accessibilityLiveRegion).toBe('polite');
  expect(screen.getAllByText('156 kcal').length).toBeGreaterThan(0);
});

test('confirms multiple selected foods sequentially with separate idempotency keys', async () => {
  api.searchSourcedFoods.mockResolvedValue({
    items: [
      { id: 'synthetic-test-source:rice', name: 'Cơm gạo lứt', basis: { amount: 100, unit: 'g' }, source: { label: 'Nguồn thử nghiệm', recordId: 'rice', edition: '2025' } },
      { id: 'synthetic-test-source:fish', name: 'Cá hồi', basis: { amount: 100, unit: 'g' }, source: { label: 'Nguồn thử nghiệm', recordId: 'fish', edition: '2025' } },
    ],
  });
  api.createMyMealEntry.mockResolvedValueOnce({ item: savedEntry }).mockRejectedValueOnce(new Error('Không kết nối được API.')).mockResolvedValueOnce({ item: savedEntry });
  const screen = renderDiary();

  await openAddFood(screen);
  await pressLabel(screen, 'Tìm thực phẩm');
  await press(screen, 'Cơm gạo lứt');
  await press(screen, 'Cá hồi');
  expect(screen.getByText('Đã chọn: 2 món')).toBeTruthy();
  await press(screen, 'Xem khẩu phần (2) →');
  await press(screen, '⊕ Xác nhận thêm vào bữa');
  await waitFor(() => expect(screen.getByText('Món 2 · các món trước đã được lưu thành công.')).toBeTruthy());
  expect(screen.getByText('Cá hồi')).toBeTruthy();
  await press(screen, '⊕ Xác nhận thêm vào bữa');
  await waitFor(() => expect(screen.getByText('Không kết nối được API.')).toBeTruthy());
  await press(screen, 'Thử lưu lại');

  await waitFor(() => expect(api.createMyMealEntry).toHaveBeenCalledTimes(3));
  const first = api.createMyMealEntry.mock.calls[0];
  const second = api.createMyMealEntry.mock.calls[1];
  const retry = api.createMyMealEntry.mock.calls[2];
  expect(first[0].foodId).toBe('synthetic-test-source:rice');
  expect(second[0].foodId).toBe('synthetic-test-source:fish');
  expect(first[1]).not.toBe(second[1]);
  expect(retry).toEqual(second);
  expect(first[0]).not.toHaveProperty('nutrients');
  await waitFor(() => expect(screen.getByText('Đã lưu nhật ký.')).toBeTruthy());
});

test('updates and deletes only after the API confirms each mutation', async () => {
  const updatedEntry = { ...savedEntry, notes: 'đã sửa' };
  api.getMyMealEntries.mockResolvedValueOnce(savedDiary).mockResolvedValueOnce({ items: [updatedEntry], hasEntries: true, totals: savedEntry.nutrients }).mockResolvedValueOnce(emptyDiary);
  api.updateMyMealEntry.mockResolvedValue({ item: updatedEntry });
  api.deleteMyMealEntry.mockResolvedValue(null);
  let deleteRequest;
  const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
    deleteRequest = buttons.find(button => button.style === 'destructive').onPress();
  });
  const screen = renderDiary();

  await waitFor(() => expect(screen.getByText('Cơm trắng')).toBeTruthy());
  await press(screen, 'Sửa');
  await changeText(screen, 'Ghi chú (tùy chọn)', 'đã sửa');
  await press(screen, 'Lưu thay đổi');
  await waitFor(() => expect(api.updateMyMealEntry).toHaveBeenCalledWith('entry-1', expect.objectContaining({ notes: 'đã sửa' })));
  await waitFor(() => expect(screen.getByText('đã sửa')).toBeTruthy());

  await act(async () => {
    fireEvent.press(screen.getByText('Xóa'));
    await deleteRequest;
  });
  await waitFor(() => expect(api.deleteMyMealEntry).toHaveBeenCalledWith('entry-1'));
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
  api.getMyMealEntries.mockResolvedValue({ items: [entry], hasEntries: true, totals: entry.nutrients });
  api.updateMyMealEntry.mockResolvedValue({ item: entry });
  const screen = renderDiary();

  await waitFor(() => expect(screen.getByText('Cơm trắng')).toBeTruthy());
  await press(screen, 'Sửa');
  await press(screen, 'Lưu thay đổi');

  await waitFor(() => expect(api.updateMyMealEntry).toHaveBeenCalledTimes(1));
  const [, payload] = api.updateMyMealEntry.mock.calls[0];
  expect(Date.parse(payload.consumedAt)).toBe(Date.parse(consumedAt));
  expect(payload.timeZone).toBe(testTimeZone);
});
