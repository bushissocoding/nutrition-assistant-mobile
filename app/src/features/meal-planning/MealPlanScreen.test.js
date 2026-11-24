import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import MealPlanScreen from './MealPlanScreen';
import { api } from '../../services/api';

jest.mock('../../services/api', () => ({ api: { createMyMealPlan: jest.fn(), getMyMealPlans: jest.fn(), searchSourcedFoods: jest.fn(), calculateSourcedNutrition: jest.fn() } }));

const profile = { mode: 'healthy', allergies: [], redFlags: [] };
const generatedPlan = {
  contractVersion: 1,
  status: 'feasible',
  planFeasible: true,
  plan: [{
    id: 'rice-egg-cabbage',
    slot: 'Bữa sáng',
    name: 'Cơm trứng và bắp cải',
    instructions: ['Dùng cơm đã nấu chín.'],
    portions: [{ foodId: 'rice-steamed', food: 'Cơm trắng', grams: 100, unit: 'g', household: 'nửa bát', provenance: { foodVersion: 'food-1', sourceId: 'usda-fooddata-central', sourceName: 'USDA FoodData Central', edition: 'legacy' } }],
    nutrients: { energyKcal: 130, proteinG: 2.7, carbohydrateG: 28.2, fatG: 0.3, fiberG: 0.4, sodiumMg: 1 },
    estimatedCostVnd: null,
    price: { value: null, unit: 'VND', status: 'missing', reason: 'Chưa có giá có nguồn.' },
    explanation: 'Được chọn vì điểm lệch mục tiêu thấp nhất trong các phương án hợp lệ.',
    warnings: [{ code: 'PRICE_DATA_UNAVAILABLE', message: 'Chưa có giá có nguồn.' }],
    provenance: { templateVersion: 'meal-template-1', foods: [{ foodId: 'rice-steamed', foodVersion: 'food-1', sourceId: 'usda-fooddata-central', sourceName: 'USDA FoodData Central', edition: 'legacy' }] }
  }],
  dailyTotals: { energyKcal: 130, proteinG: 2.7, carbohydrateG: 28.2, fatG: 0.3, fiberG: 0.4, sodiumMg: 1 },
  estimatedCostVnd: null,
  grocery: [{ foodId: 'rice-steamed', name: 'Cơm trắng', grams: 100 }],
  warnings: [{ code: 'PRICE_DATA_UNAVAILABLE', message: 'Chi phí chưa thể ước tính do chưa có nguồn giá.' }],
  limitations: ['Gợi ý demo; không phải tư vấn điều trị.'],
  metadata: { catalogVersion: 'catalog-1', algorithmVersion: 'meal-planner-v2' }
};
const persistedPlan = { ...generatedPlan, savedPlan: { id: 'saved-plan-1', createdAt: '2026-11-24T00:00:00.000Z', catalogVersion: 'USDA-FDC-live-v1', profileUpdatedAt: '2026-11-24T00:00:00.000Z' } };

beforeEach(() => jest.clearAllMocks());

test('loads and restores a saved account meal plan', async () => {
  api.getMyMealPlans.mockResolvedValue({ items: [persistedPlan.savedPlan && { ...persistedPlan.savedPlan, plan: generatedPlan }] });
  const screen = render(<MealPlanScreen profile={profile} />);
  fireEvent.press(screen.getByText('Xem kế hoạch đã lưu'));
  await waitFor(() => expect(screen.getByText('Kế hoạch tài khoản')).toBeTruthy());
  fireEvent.press(screen.getByRole('button', { name: /Cơm trứng và bắp cải/ }));
  expect(screen.getByText('Lịch thực đơn')).toBeTruthy();
  expect(api.getMyMealPlans).toHaveBeenCalledWith({ limit: 20, offset: 0 });
});

test('passes a feasible backend plan to the create-list flow and displays provenance', async () => {
  const onOpenGrocery = jest.fn();
  api.createMyMealPlan.mockResolvedValue(persistedPlan);
  const screen = render(<MealPlanScreen profile={profile} onOpenGrocery={onOpenGrocery} />);

  await act(async () => { fireEvent.press(screen.getByText('Tạo thực đơn')); });
  await waitFor(() => expect(screen.getByText('Tạo danh sách đi chợ')).toBeTruthy());
  expect(screen.getAllByText(/USDA FoodData Central/).length).toBeGreaterThan(0);
  expect(screen.getAllByText(/Chưa có giá có nguồn/).length).toBeGreaterThan(0);
  fireEvent.press(screen.getByText('Tạo danh sách đi chợ'));
  expect(onOpenGrocery).toHaveBeenCalledWith(persistedPlan.savedPlan.id);
  expect(api.createMyMealPlan).toHaveBeenCalledWith({ contractVersion: 1, preferences: '' }, expect.stringMatching(/^plan-/));
  expect(api.createMyMealPlan.mock.calls[0][0]).not.toHaveProperty('allergies');
  expect(api.createMyMealPlan.mock.calls[0][0]).not.toHaveProperty('hardLimits');
});

test('debounces sourced food search and calculates selected serving with server data', async () => {
  const food = { id: 'fdc:12345', name: 'Beans, cooked', dataType: 'Foundation', source: { id: 'USDA-FDC', label: 'USDA FoodData Central', recordId: '12345', edition: '2025-04-01' } };
  api.searchSourcedFoods.mockResolvedValue({ items: [food] });
  api.calculateSourcedNutrition.mockResolvedValue({
    totals: { energyKcal: 50, proteinG: 5, carbohydrateG: 10, fatG: 0.5, fiberG: 1.5, sodiumMg: 1 },
    items: [{ foodId: food.id, catalogVersion: 'USDA-FDC-live-v1' }],
    sources: [{ label: 'USDA FoodData Central', recordId: '12345', edition: '2025-04-01' }],
    disclaimer: 'Ước tính tham khảo.',
  });
  const screen = render(<MealPlanScreen profile={profile} />);
  fireEvent.changeText(screen.getByLabelText('Tìm thực phẩm USDA'), 'beans');
  await waitFor(() => expect(api.searchSourcedFoods).toHaveBeenCalledWith('beans', expect.objectContaining({ signal: expect.anything() })));
  fireEvent.press(screen.getByRole('button', { name: 'Thêm Beans, cooked' }));
  fireEvent.changeText(screen.getByLabelText('Khối lượng Beans, cooked (g)'), '50');
  await act(async () => { fireEvent.press(screen.getByText('Tính dinh dưỡng theo USDA')); });
  await waitFor(() => expect(api.calculateSourcedNutrition).toHaveBeenCalledWith([{ foodId: food.id, grams: 50 }]));
  expect(screen.getByText('Năng lượng: 50 kcal')).toBeTruthy();
  expect(screen.getByText(/USDA FoodData Central #12345/)).toBeTruthy();
});

test('live food source outage is visible and does not silently substitute prototype results', async () => {
  api.searchSourcedFoods.mockRejectedValue(new Error('Nguồn USDA chưa được cấu hình.'));
  const screen = render(<MealPlanScreen profile={profile} />);
  fireEvent.changeText(screen.getByLabelText('Tìm thực phẩm USDA'), 'beans');
  expect(await screen.findByText('Nguồn USDA chưa được cấu hình.')).toBeTruthy();
  expect(screen.queryByText('Beans, cooked')).toBeNull();
});

test('opens a recipe detail from a generated meal and returns to the schedule', async () => {
  api.createMyMealPlan.mockResolvedValue(persistedPlan);
  const screen = render(<MealPlanScreen profile={profile} />);

  await act(async () => { fireEvent.press(screen.getByText('Tạo thực đơn')); });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Xem công thức Cơm trứng và bắp cải' })).toBeTruthy());
  fireEvent.press(screen.getByRole('button', { name: 'Xem công thức Cơm trứng và bắp cải' }));
  expect(screen.getByText('FOOD')).toBeTruthy();
  expect(screen.getByText('Cơm trắng')).toBeTruthy();
  expect(screen.getByText('100 g')).toBeTruthy();
  expect(screen.getByText('1. Dùng cơm đã nấu chín.')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'Quay lại thực đơn' }));
  expect(screen.getByText('Lịch ăn hằng ngày')).toBeTruthy();
});

test('shows an explicit infeasible state and does not expose a partial plan as success', async () => {
  api.createMyMealPlan.mockResolvedValue({
    contractVersion: 1,
    status: 'infeasible',
    planFeasible: false,
    plan: [],
    warnings: [],
    infeasibility: { code: 'NO_SAFE_MEAL_FOR_SLOT', message: 'Không có món an toàn cho Bữa tối.', details: [] },
    limitations: []
  });
  const onPlanGenerated = jest.fn();
  const screen = render(<MealPlanScreen profile={profile} onPlanGenerated={onPlanGenerated} />);

  await act(async () => { fireEvent.press(screen.getByText('Tạo thực đơn')); });
  expect(screen.getByText('Chưa có thực đơn khả thi')).toBeTruthy();
  expect(screen.getByText('Không có món an toàn cho Bữa tối.')).toBeTruthy();
  expect(screen.queryByText('Tạo danh sách đi chợ')).toBeNull();
  expect(onPlanGenerated).not.toHaveBeenCalled();
});

test('shows unavailable plan data without substituting an unsourced catalog', async () => {
  api.createMyMealPlan.mockResolvedValue({
    contractVersion: 1,
    status: 'unavailable',
    planFeasible: false,
    plan: [],
    warnings: [],
    unavailability: { code: 'FOOD_SOURCE_UNAVAILABLE', message: 'Nguồn USDA chưa được cấu hình.' },
    limitations: []
  });
  const screen = render(<MealPlanScreen profile={profile} />);
  await act(async () => { fireEvent.press(screen.getByText('Tạo thực đơn')); });
  expect(screen.getByText('Dữ liệu chưa đủ để tạo thực đơn')).toBeTruthy();
  expect(screen.getByText('Nguồn USDA chưa được cấu hình.')).toBeTruthy();
  expect(screen.queryByText(/tự.*đổi|bỏ.*giới hạn y tế/i)).toBeNull();
});

test('shows a loading state while the request is pending', async () => {
  let resolveRequest;
  api.createMyMealPlan.mockReturnValue(new Promise(resolve => { resolveRequest = resolve; }));
  const screen = render(<MealPlanScreen profile={profile} />);
  fireEvent.press(screen.getByText('Tạo thực đơn'));
  expect(screen.getByText('Đang tạo thực đơn')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Đang tạo thực đơn' }).props.accessibilityState?.disabled).toBe(true);
  await act(async () => { resolveRequest(persistedPlan); });
  await waitFor(() => expect(screen.getByText('Tạo danh sách đi chợ')).toBeTruthy());
});

test('shows a direct retry after a network error and repeats the same plan request', async () => {
  api.createMyMealPlan.mockRejectedValueOnce(new Error('API đang ngoại tuyến.')).mockResolvedValueOnce(persistedPlan);
  const screen = render(<MealPlanScreen profile={profile} />);

  await act(async () => { fireEvent.press(screen.getByText('Tạo thực đơn')); });
  expect(screen.getByText('API đang ngoại tuyến.')).toBeTruthy();
  const retry = screen.getByRole('button', { name: 'Thử lại tạo thực đơn' });
  expect(retry).toBeTruthy();

  await act(async () => { fireEvent.press(retry); });
  await waitFor(() => expect(screen.getByText('Tạo danh sách đi chợ')).toBeTruthy());
  expect(api.createMyMealPlan).toHaveBeenCalledTimes(2);
  expect(api.createMyMealPlan.mock.calls[1]).toEqual(api.createMyMealPlan.mock.calls[0]);
});
