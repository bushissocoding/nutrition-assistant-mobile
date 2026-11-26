import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import GroceryScreen from './GroceryScreen';
import { api } from '../../services/api';

jest.mock('../../services/api', () => ({
  api: {
    getMyShoppingList: jest.fn(),
    createMyShoppingList: jest.fn(),
    updateMyShoppingListItem: jest.fn(),
    deleteMyShoppingListItem: jest.fn(),
    getMyPantry: jest.fn(),
    getMyPantryItem: jest.fn(),
    getMyPantryItemByFoodId: jest.fn(),
    createMyPantryItem: jest.fn(),
    updateMyPantryItem: jest.fn(),
    deleteMyPantryItem: jest.fn(),
    searchSourcedFoods: jest.fn(),
  },
}));

const item = {
  id: 'item-rice', foodId: 'rice-steamed', name: 'Cơm trắng', amount: 300, unit: 'g', purchased: false,
  createdAt: '2026-11-16T05:16:00.000Z', updatedAt: '2026-11-16T05:16:00.000Z',
};
const savedList = { id: 'list-1', source: 'meal-plan', items: [item], createdAt: item.createdAt, updatedAt: item.updatedAt };

beforeEach(() => {
  jest.clearAllMocks();
  api.getMyShoppingList.mockResolvedValue({ list: null });
  api.getMyPantry.mockResolvedValue({ items: [], pagination: { total: 0, limit: 100, offset: 0, hasMore: false } });
  api.createMyShoppingList.mockResolvedValue({ list: savedList });
  api.updateMyShoppingListItem.mockImplementation(async (_id, patch) => ({ item: { ...item, ...patch } }));
  api.deleteMyShoppingListItem.mockResolvedValue(null);
  api.searchSourcedFoods.mockResolvedValue({ items: [] });
  api.createMyPantryItem.mockImplementation(async payload => ({ item: { ...payload, id: 'pantry-new', name: 'Yến mạch', source: { id: 'USDA-FDC', recordId: '321' } } }));
  api.updateMyPantryItem.mockImplementation(async (id, patch) => ({ item: { id, foodId: 'fdc:321', name: 'Yến mạch', unit: 'g', ...patch } }));
  api.deleteMyPantryItem.mockResolvedValue(null);
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
  api.getMyShoppingList.mockReturnValue(new Promise(resolve => { finishLoad = resolve; }));
  const screen = render(<GroceryScreen />);

  expect(screen.getByText('Đang tải danh sách đi chợ…')).toBeTruthy();
  await act(async () => finishLoad({ list: null }));
  await waitFor(() => expect(screen.getByText('Chưa có danh sách đi chợ đã lưu.')).toBeTruthy());
  expect(screen.queryByText('Cơm trắng')).toBeNull();
  expect(screen.queryByText(/Danh sách minh họa/)).toBeNull();
});

test('shows load error and retries the current-list request', async () => {
  api.getMyShoppingList.mockRejectedValueOnce(new Error('API đang ngoại tuyến.')).mockResolvedValueOnce({ list: savedList });
  const screen = render(<GroceryScreen />);

  await waitFor(() => expect(screen.getByText('API đang ngoại tuyến.')).toBeTruthy());
  await press(screen, 'Thử tải lại');
  await waitFor(() => expect(screen.getByText('Cơm trắng')).toBeTruthy());
  expect(api.getMyShoppingList).toHaveBeenCalledTimes(2);
});

test('searches USDA and persists pantry ingredients and quantity changes through the account API', async () => {
  api.searchSourcedFoods.mockResolvedValue({ items: [{ id: 'fdc:321', name: 'Yến mạch', source: { recordId: '321' } }] });
  api.getMyPantry.mockResolvedValue({ items: [] });
  api.createMyPantryItem.mockResolvedValue({ item: { id: 'pantry-new', foodId: 'fdc:321', name: 'Yến mạch', amount: 300, unit: 'g', source: { id: 'USDA-FDC', recordId: '321' } } });
  api.updateMyPantryItem.mockResolvedValue({ item: { id: 'pantry-new', foodId: 'fdc:321', name: 'Yến mạch', amount: 200, unit: 'g' } });
  const screen = render(<GroceryScreen />);
  await waitFor(() => expect(screen.getByText('Chưa có danh sách đi chợ đã lưu.')).toBeTruthy());

  expect(screen.getByText(/0\/0 món đã tải/)).toBeTruthy();
  await press(screen, 'Thêm từ USDA');
  await act(async () => { fireEvent.changeText(screen.getByLabelText('Tìm nguyên liệu hoặc nhập tên tự do'), 'Yến mạch'); });
  await press(screen, 'Tìm USDA');
  await press(screen, 'Thêm vào kho');
  await waitFor(() => expect(api.createMyPantryItem).toHaveBeenCalledWith({ foodId: 'fdc:321', amount: 100, unit: 'g' }));
  expect(screen.getByText('Yến mạch')).toBeTruthy();
  await pressNode(screen.getByLabelText('Giảm Yến mạch'));
  expect(api.updateMyPantryItem).toHaveBeenCalledWith('pantry-new', { amount: 200, unit: 'g' });
  expect(api.createMyShoppingList).not.toHaveBeenCalled();
});

test('stores a user-entered pantry label while clearly excluding it from nutrition calculations', async () => {
  api.createMyPantryItem.mockResolvedValue({ item: { id: 'pantry-custom', foodId: 'custom:abc', name: 'Rau muống', amount: 100, unit: 'g', source: { id: 'USER-ENTERED' } }, replayed: false });
  const screen = render(<GroceryScreen />);
  await waitFor(() => expect(screen.getByText('Kho nhà chưa có nguyên liệu đã lưu.')).toBeTruthy());

  await press(screen, 'Thêm từ USDA');
  await act(async () => { fireEvent.changeText(screen.getByLabelText('Tìm nguyên liệu hoặc nhập tên tự do'), '  Rau   muống '); });
  expect(screen.getByText('Nguyên liệu tự nhập chỉ để theo dõi kho; không được dùng để tính dinh dưỡng.')).toBeTruthy();
  await press(screen, 'Thêm tên tự nhập vào kho');

  await waitFor(() => expect(api.createMyPantryItem).toHaveBeenCalledWith({ customName: 'Rau muống', amount: 100, unit: 'g' }));
  expect(screen.getByText('Rau muống')).toBeTruthy();
  expect(screen.getByText('Tự nhập · không dùng trong tính toán dinh dưỡng')).toBeTruthy();
  expect(screen.queryByText(/Tải thêm nguyên liệu/)).toBeNull();
});

test('does not invent pantry rows when account data is empty', async () => {
  const screen = render(<GroceryScreen />);
  await waitFor(() => expect(screen.getByText('Kho nhà chưa có nguyên liệu đã lưu.')).toBeTruthy());
  expect(screen.queryByText('Ức gà phi lê')).toBeNull();
  expect(screen.queryByText('Trứng gà ta')).toBeNull();
});

test('loads pantry rows in bounded pages and exposes the remaining count', async () => {
  const firstPage = Array.from({ length: 100 }, (_, index) => ({ id: `pantry-${index}`, foodId: `fdc:${index + 1}`, name: `Food ${index + 1}`, amount: 250, unit: 'g', source: { id: 'USDA-FDC', recordId: String(index + 1) } }));
  const lastItem = { id: 'pantry-100', foodId: 'fdc:101', name: 'Food 101', amount: 250, unit: 'g', source: { id: 'USDA-FDC', recordId: '101' } };
  api.getMyPantry.mockResolvedValueOnce({ items: firstPage, pagination: { limit: 100, offset: 0, total: 101, hasMore: true } })
    .mockResolvedValueOnce({ items: [lastItem], pagination: { limit: 100, offset: 100, total: 101, hasMore: false } });
  const screen = render(<GroceryScreen />);
  await waitFor(() => expect(screen.getByText('Tải thêm nguyên liệu (100/101)')).toBeTruthy());
  await press(screen, 'Tải thêm nguyên liệu (100/101)');
  await waitFor(() => expect(screen.getByText('Food 101')).toBeTruthy());
  expect(api.getMyPantry).toHaveBeenNthCalledWith(1, { limit: 100, offset: 0 });
  expect(api.getMyPantry).toHaveBeenNthCalledWith(2, { limit: 100, offset: 100 });
});

test('retries a failed purchased update without reflecting it before server confirmation', async () => {
  api.getMyShoppingList.mockResolvedValue({ list: savedList });
  api.updateMyShoppingListItem.mockRejectedValueOnce(new Error('Không lưu được trạng thái.')).mockResolvedValueOnce({ item: { ...item, purchased: true } });
  const screen = render(<GroceryScreen />);
  await waitFor(() => expect(screen.getByLabelText('Đánh dấu đã mua Cơm trắng')).toBeTruthy());

  await pressNode(screen.getByLabelText('Đánh dấu đã mua Cơm trắng'));
  await waitFor(() => expect(screen.getByText('Không lưu được trạng thái.')).toBeTruthy());
  expect(screen.getByLabelText('Đánh dấu đã mua Cơm trắng').props.accessibilityState.checked).toBe(false);
  await press(screen, 'Thử thao tác lại');
  await waitFor(() => expect(screen.getByLabelText('Đánh dấu chưa mua Cơm trắng').props.accessibilityState.checked).toBe(true));
  expect(api.updateMyShoppingListItem.mock.calls[1]).toEqual(api.updateMyShoppingListItem.mock.calls[0]);
});

test('keeps an edited quantity out of the saved row until a retry is confirmed', async () => {
  api.getMyShoppingList.mockResolvedValue({ list: savedList });
  api.updateMyShoppingListItem.mockRejectedValueOnce(new Error('Không lưu được số lượng.')).mockResolvedValueOnce({ item: { ...item, amount: 500 } });
  const screen = render(<GroceryScreen />);
  await waitFor(() => expect(screen.getByText('Cơm trắng')).toBeTruthy());

  await changeText(screen, 'Số lượng Cơm trắng', '500');
  await pressNode(screen.getByLabelText('Lưu thay đổi Cơm trắng'));
  await waitFor(() => expect(screen.getByText('Không lưu được số lượng.')).toBeTruthy());
  expect(screen.getByLabelText('Cơm trắng, 300 g')).toBeTruthy();

  await press(screen, 'Thử thao tác lại');
  await waitFor(() => expect(screen.getByLabelText('Cơm trắng, 500 g')).toBeTruthy());
});

test('saves amount/unit edits and deletes an item only after API confirmation', async () => {
  api.getMyShoppingList.mockResolvedValue({ list: savedList });
  api.updateMyShoppingListItem.mockResolvedValue({ item: { ...item, amount: 1.5, unit: 'kg' } });
  let deleteRequest;
  const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
    deleteRequest = buttons.find(button => button.style === 'destructive').onPress();
  });
  const screen = render(<GroceryScreen />);
  await waitFor(() => expect(screen.getByText('Cơm trắng')).toBeTruthy());

  await changeText(screen, 'Số lượng Cơm trắng', '1.5');
  await changeText(screen, 'Đơn vị Cơm trắng', 'kg');
  await pressNode(screen.getByLabelText('Lưu thay đổi Cơm trắng'));
  await waitFor(() => expect(screen.getByLabelText('Cơm trắng, 1.5 kg')).toBeTruthy());
  expect(api.updateMyShoppingListItem).toHaveBeenCalledWith('item-rice', { amount: 1.5, unit: 'kg' });

  await act(async () => {
    fireEvent.press(screen.getByLabelText('Xóa Cơm trắng'));
    await deleteRequest;
  });
  await waitFor(() => expect(api.deleteMyShoppingListItem).toHaveBeenCalledWith('item-rice'));
  expect(screen.getByText('Danh sách hiện tại chưa có nguyên liệu.')).toBeTruthy();
  expect(alertSpy).toHaveBeenCalled();
  alertSpy.mockRestore();
});

test('creates from plan, then retries the same payload and idempotency key after a network error', async () => {
  api.createMyShoppingList.mockRejectedValueOnce(new Error('Mạng bị ngắt.')).mockResolvedValueOnce({ list: savedList });
  const savedPlanId = '82b4fefe-81fd-44f1-8be0-905e33f10b16';
  const screen = render(<GroceryScreen savedPlanId={savedPlanId} />);
  await waitFor(() => expect(screen.getByText('Tạo danh sách từ thực đơn đã lưu')).toBeTruthy());

  await press(screen, 'Tạo danh sách từ thực đơn đã lưu');
  await waitFor(() => expect(screen.getByText('Mạng bị ngắt.')).toBeTruthy());
  expect(screen.queryByText('Đã lưu danh sách đi chợ.')).toBeNull();
  await press(screen, 'Thử thao tác lại');
  await waitFor(() => expect(screen.getByText('Cơm trắng')).toBeTruthy());
  expect(screen.getByText('Đã lưu danh sách đi chợ.').props.accessibilityLiveRegion).toBe('polite');

  expect(api.createMyShoppingList).toHaveBeenCalledTimes(2);
  expect(api.createMyShoppingList.mock.calls[0][0]).toEqual(savedPlanId);
  expect(api.createMyShoppingList.mock.calls[1]).toEqual(api.createMyShoppingList.mock.calls[0]);
});

test('requires confirmation before replacing an existing list', async () => {
  api.getMyShoppingList.mockResolvedValue({ list: savedList });
  let confirmReplace;
  const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => {
    confirmReplace = buttons.find(button => button.style === 'destructive').onPress;
  });
  const screen = render(<GroceryScreen savedPlanId="82b4fefe-81fd-44f1-8be0-905e33f10b16" />);
  await waitFor(() => expect(screen.getByText('Tạo danh sách từ thực đơn đã lưu')).toBeTruthy());

  await press(screen, 'Tạo danh sách từ thực đơn đã lưu');
  expect(alertSpy).toHaveBeenCalled();
  expect(api.createMyShoppingList).not.toHaveBeenCalled();
  await act(async () => confirmReplace());
  await waitFor(() => expect(api.createMyShoppingList).toHaveBeenCalledTimes(1));
  alertSpy.mockRestore();
});

test('reconciles a delete timeout from the server when retry discovers the item is already gone', async () => {
  api.getMyShoppingList.mockResolvedValueOnce({ list: savedList }).mockResolvedValueOnce({ list: { ...savedList, items: [] } });
  api.deleteMyShoppingListItem.mockRejectedValueOnce(new Error('Mạng bị ngắt sau thao tác.'));
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
  expect(api.deleteMyShoppingListItem).toHaveBeenCalledTimes(1);
  expect(alertSpy).toHaveBeenCalled();
  alertSpy.mockRestore();
});
