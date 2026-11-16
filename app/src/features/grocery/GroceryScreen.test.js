import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import GroceryScreen from './GroceryScreen';
import { api } from '../../services/api';

jest.mock('../../services/api', () => ({
  api: {
    getCurrentShoppingList: jest.fn(),
    createShoppingList: jest.fn(),
    updateShoppingListItem: jest.fn(),
    deleteShoppingListItem: jest.fn(),
  },
}));

const item = {
  id: 'item-rice', foodId: 'rice-steamed', name: 'Cơm trắng', amount: 300, unit: 'g', purchased: false,
  createdAt: '2026-11-16T05:16:00.000Z', updatedAt: '2026-11-16T05:16:00.000Z',
};
const savedList = { id: 'list-1', source: 'meal-plan', items: [item], createdAt: item.createdAt, updatedAt: item.updatedAt };

beforeEach(() => {
  jest.clearAllMocks();
  api.getCurrentShoppingList.mockResolvedValue({ list: null });
  api.createShoppingList.mockResolvedValue({ list: savedList });
  api.updateShoppingListItem.mockImplementation(async (_id, patch) => ({ item: { ...item, ...patch } }));
  api.deleteShoppingListItem.mockResolvedValue(null);
});

async function press(screen, label) {
  await act(async () => {
    fireEvent.press(screen.getByText(label));
    for (let index = 0; index < 4; index += 1) await Promise.resolve();
  });
}

async function pressNode(node) {
  await act(async () => {
    fireEvent.press(node);
    for (let index = 0; index < 4; index += 1) await Promise.resolve();
  });
}

async function changeText(screen, placeholder, value) {
  await act(async () => { fireEvent.changeText(screen.getByPlaceholderText(placeholder), value); });
}

test('shows finite loading then the no-list empty state without sample rows', async () => {
  let finishLoad;
  api.getCurrentShoppingList.mockReturnValue(new Promise(resolve => { finishLoad = resolve; }));
  const screen = render(<GroceryScreen />);

  expect(screen.getByText('Đang tải danh sách đi chợ…')).toBeTruthy();
  await act(async () => finishLoad({ list: null }));
  await waitFor(() => expect(screen.getByText('Chưa có danh sách đi chợ đã lưu.')).toBeTruthy());
  expect(screen.queryByText('Cơm trắng')).toBeNull();
  expect(screen.queryByText(/Danh sách minh họa/)).toBeNull();
});

test('shows load error and retries the current-list request', async () => {
  api.getCurrentShoppingList.mockRejectedValueOnce(new Error('API đang ngoại tuyến.')).mockResolvedValueOnce({ list: savedList });
  const screen = render(<GroceryScreen />);

  await waitFor(() => expect(screen.getByText('API đang ngoại tuyến.')).toBeTruthy());
  await press(screen, 'Thử tải lại');
  await waitFor(() => expect(screen.getByText('Cơm trắng')).toBeTruthy());
  expect(api.getCurrentShoppingList).toHaveBeenCalledTimes(2);
});

test('retries a failed purchased update without reflecting it before server confirmation', async () => {
  api.getCurrentShoppingList.mockResolvedValue({ list: savedList });
  api.updateShoppingListItem.mockRejectedValueOnce(new Error('Không lưu được trạng thái.')).mockResolvedValueOnce({ item: { ...item, purchased: true } });
  const screen = render(<GroceryScreen />);
  await waitFor(() => expect(screen.getByLabelText('Đánh dấu đã mua Cơm trắng')).toBeTruthy());

  await pressNode(screen.getByLabelText('Đánh dấu đã mua Cơm trắng'));
  await waitFor(() => expect(screen.getByText('Không lưu được trạng thái.')).toBeTruthy());
  expect(screen.getByLabelText('Đánh dấu đã mua Cơm trắng').props.accessibilityState.checked).toBe(false);
  await press(screen, 'Thử thao tác lại');
  await waitFor(() => expect(screen.getByLabelText('Đánh dấu chưa mua Cơm trắng').props.accessibilityState.checked).toBe(true));
  expect(api.updateShoppingListItem.mock.calls[1]).toEqual(api.updateShoppingListItem.mock.calls[0]);
});

test('keeps an edited quantity out of the saved row until a retry is confirmed', async () => {
  api.getCurrentShoppingList.mockResolvedValue({ list: savedList });
  api.updateShoppingListItem.mockRejectedValueOnce(new Error('Không lưu được số lượng.')).mockResolvedValueOnce({ item: { ...item, amount: 500 } });
  const screen = render(<GroceryScreen />);
  await waitFor(() => expect(screen.getByText('Cơm trắng')).toBeTruthy());

  await changeText(screen, 'Số lượng Cơm trắng', '500');
  await pressNode(screen.getByLabelText('Lưu thay đổi Cơm trắng'));
  await waitFor(() => expect(screen.getByText('Không lưu được số lượng.')).toBeTruthy());
  expect(screen.getByText(/300\s*g/)).toBeTruthy();

  await press(screen, 'Thử thao tác lại');
  await waitFor(() => expect(screen.getByText(/500\s*g/)).toBeTruthy());
});

test('saves amount/unit edits and deletes an item only after API confirmation', async () => {
  api.getCurrentShoppingList.mockResolvedValue({ list: savedList });
  api.updateShoppingListItem.mockResolvedValue({ item: { ...item, amount: 1.5, unit: 'kg' } });
  let deleteRequest;
  const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
    deleteRequest = buttons.find(button => button.style === 'destructive').onPress();
  });
  const screen = render(<GroceryScreen />);
  await waitFor(() => expect(screen.getByText('Cơm trắng')).toBeTruthy());

  await changeText(screen, 'Số lượng Cơm trắng', '1.5');
  await changeText(screen, 'Đơn vị Cơm trắng', 'kg');
  await pressNode(screen.getByLabelText('Lưu thay đổi Cơm trắng'));
  await waitFor(() => expect(screen.getByText(/1\.5\s*kg/)).toBeTruthy());
  expect(api.updateShoppingListItem).toHaveBeenCalledWith('item-rice', { amount: 1.5, unit: 'kg' });

  await act(async () => {
    fireEvent.press(screen.getByLabelText('Xóa Cơm trắng'));
    await deleteRequest;
  });
  await waitFor(() => expect(api.deleteShoppingListItem).toHaveBeenCalledWith('item-rice'));
  expect(screen.getByText('Danh sách hiện tại chưa có nguyên liệu.')).toBeTruthy();
  expect(alertSpy).toHaveBeenCalled();
  alertSpy.mockRestore();
});

test('creates from plan, then retries the same payload and idempotency key after a network error', async () => {
  api.createShoppingList.mockRejectedValueOnce(new Error('Mạng bị ngắt.')).mockResolvedValueOnce({ list: savedList });
  const screen = render(<GroceryScreen sourceItems={[{ foodId: 'rice-steamed', name: 'Cơm trắng', grams: 300 }]} />);
  await waitFor(() => expect(screen.getByText('Tạo danh sách từ thực đơn')).toBeTruthy());

  await press(screen, 'Tạo danh sách từ thực đơn');
  await waitFor(() => expect(screen.getByText('Mạng bị ngắt.')).toBeTruthy());
  expect(screen.queryByText('Đã lưu danh sách đi chợ.')).toBeNull();
  await press(screen, 'Thử thao tác lại');
  await waitFor(() => expect(screen.getByText('Cơm trắng')).toBeTruthy());

  expect(api.createShoppingList).toHaveBeenCalledTimes(2);
  expect(api.createShoppingList.mock.calls[0][0]).toEqual({ items: [{ foodId: 'rice-steamed', amount: 300, unit: 'g' }] });
  expect(api.createShoppingList.mock.calls[1]).toEqual(api.createShoppingList.mock.calls[0]);
});

test('requires confirmation before replacing an existing list', async () => {
  api.getCurrentShoppingList.mockResolvedValue({ list: savedList });
  let confirmReplace;
  const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
    confirmReplace = buttons.find(button => button.style === 'destructive').onPress;
  });
  const screen = render(<GroceryScreen sourceItems={[{ foodId: 'rice-steamed', name: 'Cơm trắng', grams: 300 }]} />);
  await waitFor(() => expect(screen.getByText('Tạo danh sách từ thực đơn')).toBeTruthy());

  await press(screen, 'Tạo danh sách từ thực đơn');
  expect(alertSpy).toHaveBeenCalled();
  expect(api.createShoppingList).not.toHaveBeenCalled();
  await act(async () => confirmReplace());
  await waitFor(() => expect(api.createShoppingList).toHaveBeenCalledTimes(1));
  alertSpy.mockRestore();
});

test('reconciles a delete timeout from the server when retry discovers the item is already gone', async () => {
  api.getCurrentShoppingList.mockResolvedValueOnce({ list: savedList }).mockResolvedValueOnce({ list: { ...savedList, items: [] } });
  api.deleteShoppingListItem.mockRejectedValueOnce(new Error('Mạng bị ngắt sau thao tác.'));
  let deleteRequest;
  const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
    deleteRequest = buttons.find(button => button.style === 'destructive').onPress();
  });
  const screen = render(<GroceryScreen />);
  await waitFor(() => expect(screen.getByText('Cơm trắng')).toBeTruthy());

  await act(async () => {
    fireEvent.press(screen.getByLabelText('Xóa Cơm trắng'));
    await deleteRequest;
  });
  await waitFor(() => expect(screen.getByText('Mạng bị ngắt sau thao tác.')).toBeTruthy());
  expect(screen.getByText('Cơm trắng')).toBeTruthy();

  await press(screen, 'Thử thao tác lại');
  await waitFor(() => expect(screen.getByText('Danh sách hiện tại chưa có nguyên liệu.')).toBeTruthy());
  expect(api.deleteShoppingListItem).toHaveBeenCalledTimes(1);
  expect(alertSpy).toHaveBeenCalled();
  alertSpy.mockRestore();
});
