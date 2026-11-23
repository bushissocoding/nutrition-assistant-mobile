import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import MealPlanScreen from './MealPlanScreen';
import { api } from '../../services/api';

jest.mock('../../services/api', () => ({ api: { generateMealPlan: jest.fn() } }));

const profile = { mode: 'healthy', allergies: [], redFlags: [] };
const generatedPlan = {
  contractVersion: 1,
  status: 'feasible',
  planFeasible: true,
  plan: [{
    id: 'rice-egg-cabbage',
    slot: 'Bữa sáng',
    name: 'Cơm trứng và bắp cải',
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

beforeEach(() => jest.clearAllMocks());

test('opens a saved grocery list from the planner before generating a new plan', () => {
  const onOpenGrocery = jest.fn();
  const screen = render(<MealPlanScreen profile={profile} onOpenGrocery={onOpenGrocery} />);
  fireEvent.press(screen.getByText('Mở danh sách đi chợ đã lưu'));
  expect(onOpenGrocery).toHaveBeenCalledWith();
});

test('passes a feasible backend plan to the create-list flow and displays provenance', async () => {
  const onOpenGrocery = jest.fn();
  api.generateMealPlan.mockResolvedValue(generatedPlan);
  const screen = render(<MealPlanScreen profile={profile} onOpenGrocery={onOpenGrocery} />);

  await act(async () => { fireEvent.press(screen.getByText('Tạo thực đơn')); });
  await waitFor(() => expect(screen.getByText('Tạo danh sách đi chợ')).toBeTruthy());
  expect(screen.getByText(/USDA FoodData Central/)).toBeTruthy();
  expect(screen.getAllByText(/Chưa có giá có nguồn/).length).toBeGreaterThan(0);
  fireEvent.press(screen.getByText('Tạo danh sách đi chợ'));
  expect(onOpenGrocery).toHaveBeenCalledWith(generatedPlan.grocery);
  expect(api.generateMealPlan).toHaveBeenCalledWith(expect.objectContaining({ contractVersion: 1 }));
  expect(api.generateMealPlan.mock.calls[0][0]).not.toHaveProperty('budgetVnd');
});

test('opens a recipe detail from a generated meal and returns to the schedule', async () => {
  api.generateMealPlan.mockResolvedValue(generatedPlan);
  const screen = render(<MealPlanScreen profile={profile} />);

  await act(async () => { fireEvent.press(screen.getByText('Tạo thực đơn')); });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Xem công thức Cơm trứng và bắp cải' })).toBeTruthy());
  fireEvent.press(screen.getByRole('button', { name: 'Xem công thức Cơm trứng và bắp cải' }));
  expect(screen.getByText('FOOD')).toBeTruthy();
  expect(screen.getByText('Cơm trắng')).toBeTruthy();
  expect(screen.getByText('100 g')).toBeTruthy();
  expect(screen.getByText(/Hướng dẫn chế biến chi tiết chưa có/i)).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'Quay lại thực đơn' }));
  expect(screen.getByText('Lịch ăn hằng ngày')).toBeTruthy();
});

test('shows an explicit infeasible state and does not expose a partial plan as success', async () => {
  api.generateMealPlan.mockResolvedValue({
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

test('explains unavailable sourced prices when a budget is submitted', async () => {
  api.generateMealPlan.mockResolvedValue({
    contractVersion: 1,
    status: 'unavailable',
    planFeasible: false,
    plan: [],
    warnings: [],
    unavailability: { code: 'PRICE_DATA_UNAVAILABLE', message: 'Chưa có giá có nguồn để đánh giá ngân sách.' },
    limitations: []
  });
  const screen = render(<MealPlanScreen profile={profile} />);
  fireEvent.changeText(screen.getByLabelText('Ngân sách mỗi ngày (VNĐ)'), '120000');
  await act(async () => { fireEvent.press(screen.getByText('Tạo thực đơn')); });
  expect(api.generateMealPlan).toHaveBeenCalledWith(expect.objectContaining({ budgetVnd: 120000 }));
  expect(screen.getByText('Dữ liệu chưa đủ để tạo thực đơn')).toBeTruthy();
  expect(screen.getByText('Chưa có giá có nguồn để đánh giá ngân sách.')).toBeTruthy();
  expect(screen.queryByText(/tự.*đổi|bỏ.*giới hạn y tế/i)).toBeNull();
});

test('shows a loading state while the request is pending', async () => {
  let resolveRequest;
  api.generateMealPlan.mockReturnValue(new Promise(resolve => { resolveRequest = resolve; }));
  const screen = render(<MealPlanScreen profile={profile} />);
  fireEvent.press(screen.getByText('Tạo thực đơn'));
  expect(screen.getByText('Đang tạo thực đơn')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Đang tạo thực đơn' }).props.accessibilityState?.disabled).toBe(true);
  await act(async () => { resolveRequest(generatedPlan); });
  await waitFor(() => expect(screen.getByText('Tạo danh sách đi chợ')).toBeTruthy());
});

test('shows a direct retry after a network error and repeats the same plan request', async () => {
  api.generateMealPlan.mockRejectedValueOnce(new Error('API đang ngoại tuyến.')).mockResolvedValueOnce(generatedPlan);
  const screen = render(<MealPlanScreen profile={profile} />);

  await act(async () => { fireEvent.press(screen.getByText('Tạo thực đơn')); });
  expect(screen.getByText('API đang ngoại tuyến.')).toBeTruthy();
  const retry = screen.getByRole('button', { name: 'Thử lại tạo thực đơn' });
  expect(retry).toBeTruthy();

  await act(async () => { fireEvent.press(retry); });
  await waitFor(() => expect(screen.getByText('Tạo danh sách đi chợ')).toBeTruthy());
  expect(api.generateMealPlan).toHaveBeenCalledTimes(2);
  expect(api.generateMealPlan.mock.calls[1]).toEqual(api.generateMealPlan.mock.calls[0]);
});
