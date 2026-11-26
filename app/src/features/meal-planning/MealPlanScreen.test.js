import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import MealPlanScreen from './MealPlanScreen';
import { api } from '../../services/api';

jest.mock('../../services/api', () => ({ api: { createMyMealPlan: jest.fn(), getMyMealPlans: jest.fn(), getMyPersonalization: jest.fn(), searchSourcedFoods: jest.fn(), calculateSourcedNutrition: jest.fn() } }));

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
    portions: [{ foodId: 'rice-steamed', food: 'Cơm trắng', grams: 100, unit: 'g', household: 'nửa bát', provenance: { foodVersion: 'food-1', sourceId: 'synthetic-test-source', sourceName: 'Nguồn thử nghiệm', edition: 'legacy' } }],
    nutrients: { energyKcal: 130, proteinG: 2.7, carbohydrateG: 28.2, fatG: 0.3, fiberG: 0.4, sodiumMg: 1 },
    estimatedCostVnd: null,
    price: { value: null, unit: 'VND', status: 'missing', reason: 'Chưa có giá có nguồn.' },
    explanation: 'Được chọn vì điểm lệch mục tiêu thấp nhất trong các phương án hợp lệ.',
    warnings: [{ code: 'PRICE_DATA_UNAVAILABLE', message: 'Chưa có giá có nguồn.' }],
    provenance: { templateVersion: 'meal-template-1', foods: [{ foodId: 'rice-steamed', foodVersion: 'food-1', sourceId: 'synthetic-test-source', sourceName: 'Nguồn thử nghiệm', edition: 'legacy' }] }
  }],
  dailyTotals: { energyKcal: 130, proteinG: 2.7, carbohydrateG: 28.2, fatG: 0.3, fiberG: 0.4, sodiumMg: 1 },
  estimatedCostVnd: null,
  grocery: [{ foodId: 'rice-steamed', name: 'Cơm trắng', grams: 100 }],
  warnings: [{ code: 'PRICE_DATA_UNAVAILABLE', message: 'Chi phí chưa thể ước tính do chưa có nguồn giá.' }],
  limitations: ['Gợi ý demo; không phải tư vấn điều trị.'],
  metadata: { catalogVersion: 'catalog-1', algorithmVersion: 'meal-planner-v2' }
};
const persistedPlan = { ...generatedPlan, savedPlan: { id: 'saved-plan-1', createdAt: '2026-11-24T00:00:00.000Z', catalogVersion: 'synthetic-test-v1', profileUpdatedAt: '2026-11-24T00:00:00.000Z' } };

beforeEach(() => {
  jest.clearAllMocks();
  api.getMyMealPlans.mockResolvedValue({ items: [] });
  api.getMyPersonalization.mockResolvedValue({ preferences: { dietaryVariety: 'varied', foodPreferences: ['Vietnamese', 'easy_cook'], allergyReminder: true, trackConfirmedTargets: false } });
});

test('shows a native app-styled sample schedule and opens its recipe details', async () => {
  const screen = render(<MealPlanScreen profile={profile} />);

  expect(screen.getByText('Thực đơn')).toBeTruthy();
  expect(screen.getByText('Các bữa trong ngày')).toBeTruthy();
  expect(screen.getByText('Trứng và bánh mì')).toBeTruthy();
  expect(screen.getByText('Tô salad')).toBeTruthy();
  expect(screen.getByText('Dinh dưỡng trong ngày')).toBeTruthy();
  expect(screen.getByText('Thực đơn mẫu')).toBeTruthy();
  expect(screen.getByText(/Số liệu minh họa giao diện/)).toBeTruthy();
  expect(screen.getByLabelText('Tổng năng lượng, mốc minh họa')).toBeTruthy();
  expect(screen.getByLabelText('Đạm, ước tính minh họa')).toBeTruthy();
  expect(api.createMyMealPlan).not.toHaveBeenCalled();
  await screen.findByText(/Ưu tiên lưu: độ phong phú/);

  fireEvent.press(screen.getByRole('button', { name: 'Xem công thức Trứng và bánh mì' }));
  expect(screen.getByText('Chi tiết món ăn')).toBeTruthy();
  expect(screen.getByRole('header', { name: 'Nguyên liệu' })).toBeTruthy();
  expect(screen.getByText('Trứng gà')).toBeTruthy();
  expect(screen.getByText('Bánh mì')).toBeTruthy();
  expect(screen.getByText('Cà chua')).toBeTruthy();
  expect(screen.getByRole('header', { name: 'Mô tả món ăn' })).toBeTruthy();
  expect(screen.getByText(/Món và định lượng chỉ minh họa cách trình bày/)).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'Quay lại lịch ăn' }));
  expect(screen.getByText('Các bữa trong ngày')).toBeTruthy();
});

test('restores the most recent saved plan automatically on entry', async () => {
  api.getMyMealPlans.mockResolvedValue({ items: [{ ...persistedPlan.savedPlan, plan: generatedPlan }] });
  const screen = render(<MealPlanScreen profile={profile} />);

  await waitFor(() => expect(screen.getByRole('button', { name: 'Xem công thức Cơm trứng và bắp cải' })).toBeTruthy());
  expect(api.getMyMealPlans).toHaveBeenCalledWith({ limit: 20, offset: 0 });
  expect(screen.queryByText('Thực đơn mẫu')).toBeNull();
});

test('loads and restores a saved account meal plan', async () => {
  api.getMyMealPlans.mockResolvedValue({ items: [persistedPlan.savedPlan && { ...persistedPlan.savedPlan, plan: generatedPlan }] });
  const screen = render(<MealPlanScreen profile={profile} />);
  fireEvent.press(screen.getByText('Xem kế hoạch đã lưu'));
  await waitFor(() => expect(screen.getByText('Kế hoạch tài khoản')).toBeTruthy());
  fireEvent.press(screen.getByRole('button', { name: 'Xem kế hoạch Cơm trứng và bắp cải' }));
  expect(screen.getByText('Các bữa trong ngày')).toBeTruthy();
  expect(api.getMyMealPlans).toHaveBeenCalledWith({ limit: 20, offset: 0 });
});

test('passes a feasible backend plan to the create-list flow and displays provenance', async () => {
  const onOpenGrocery = jest.fn();
  api.createMyMealPlan.mockResolvedValue(persistedPlan);
  const screen = render(<MealPlanScreen profile={profile} onOpenGrocery={onOpenGrocery} />);

  await screen.findByText(/Ưu tiên lưu: độ phong phú/);
  await act(async () => { fireEvent.press(screen.getByText('Tạo thực đơn')); });
  await waitFor(() => expect(screen.getByText('Tạo danh sách đi chợ')).toBeTruthy());
  expect(screen.queryByLabelText('Tổng năng lượng, mốc minh họa')).toBeNull();
  expect(screen.getByText('2.7 g')).toBeTruthy();
  expect(screen.getAllByText(/Nguồn thử nghiệm/).length).toBeGreaterThan(0);
  expect(screen.getAllByText(/Chưa có giá có nguồn/).length).toBeGreaterThan(0);
  fireEvent.press(screen.getByText('Tạo danh sách đi chợ'));
  expect(onOpenGrocery).toHaveBeenCalledWith(persistedPlan.savedPlan.id);
  expect(api.createMyMealPlan).toHaveBeenCalledWith({ contractVersion: 1, dietaryVariety: 'varied', preferences: 'món Việt; dễ nấu' }, expect.stringMatching(/^plan-/));
  expect(api.createMyMealPlan.mock.calls[0][0]).not.toHaveProperty('allergies');
  expect(api.createMyMealPlan.mock.calls[0][0]).not.toHaveProperty('hardLimits');
});

test('keeps food lookup and sourced calculations paused until NIN data rights are confirmed', () => {
  const screen = render(<MealPlanScreen profile={profile} />);
  expect(screen.getByText(/Tra cứu và tính dinh dưỡng đang tạm dừng/)).toBeTruthy();
  expect(screen.getByLabelText('Tìm thực phẩm').props.editable).toBe(false);
  expect(api.searchSourcedFoods).not.toHaveBeenCalled();
  expect(api.calculateSourcedNutrition).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Tính dinh dưỡng theo nguồn dữ liệu' }).props.accessibilityState?.disabled).toBe(true);
});

test('opens a recipe detail from a generated meal and returns to the schedule', async () => {
  api.createMyMealPlan.mockResolvedValue(persistedPlan);
  const screen = render(<MealPlanScreen profile={profile} />);

  await screen.findByText(/Ưu tiên lưu: độ phong phú/);
  await act(async () => { fireEvent.press(screen.getByText('Tạo thực đơn')); });
  await waitFor(() => expect(screen.getByRole('button', { name: 'Xem công thức Cơm trứng và bắp cải' })).toBeTruthy());
  fireEvent.press(screen.getByRole('button', { name: 'Xem công thức Cơm trứng và bắp cải' }));
  expect(screen.getByText('Chi tiết món ăn')).toBeTruthy();
  expect(screen.getByText('Cơm trắng')).toBeTruthy();
  expect(screen.getByText('100 g')).toBeTruthy();
  expect(screen.getByText('1. Dùng cơm đã nấu chín.')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'Quay lại thực đơn' }));
  expect(screen.getByText('Thực đơn')).toBeTruthy();
});

test('labels a meal rationale and missing ingredients accurately when instructions are absent', async () => {
  const planWithoutRecipeDetails = {
    ...generatedPlan,
    plan: [{ ...generatedPlan.plan[0], portions: [], instructions: [] }],
  };
  const screen = render(<MealPlanScreen profile={profile} initialPlan={planWithoutRecipeDetails} />);

  fireEvent.press(await screen.findByRole('button', { name: 'Xem công thức Cơm trứng và bắp cải' }));

  expect(screen.getByText('Lý do lựa chọn')).toBeTruthy();
  expect(screen.queryByText('Cách chế biến')).toBeNull();
  expect(screen.getByText('Chưa có dữ liệu')).toBeTruthy();
});

test('sends account food preferences and variety as bounded ranking hints without client health limits', async () => {
  api.createMyMealPlan.mockResolvedValue(persistedPlan);
  const screen = render(<MealPlanScreen profile={profile} />);
  await waitFor(() => expect(screen.getByText(/Ưu tiên lưu: độ phong phú đa dạng/)).toBeTruthy());
  fireEvent.changeText(screen.getByLabelText('Món bạn yêu thích'), 'canh bí');
  await act(async () => { fireEvent.press(screen.getByText('Tạo thực đơn')); });
  await waitFor(() => expect(api.createMyMealPlan).toHaveBeenCalledTimes(1));
  expect(api.createMyMealPlan.mock.calls[0][0]).toEqual({ contractVersion: 1, dietaryVariety: 'varied', preferences: 'canh bí; món Việt; dễ nấu' });
  expect(api.createMyMealPlan.mock.calls[0][0]).not.toHaveProperty('allergies');
  expect(api.createMyMealPlan.mock.calls[0][0]).not.toHaveProperty('hardLimits');
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

  await screen.findByText(/Ưu tiên lưu: độ phong phú/);
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
    unavailability: { code: 'FOOD_SOURCE_UNAVAILABLE', message: 'Nguồn nguồn thử nghiệm chưa được cấu hình.' },
    limitations: []
  });
  const screen = render(<MealPlanScreen profile={profile} />);
  await screen.findByText(/Ưu tiên lưu: độ phong phú/);
  await act(async () => { fireEvent.press(screen.getByText('Tạo thực đơn')); });
  expect(screen.getByText('Dữ liệu chưa đủ để tạo thực đơn')).toBeTruthy();
  expect(screen.getByText('Nguồn nguồn thử nghiệm chưa được cấu hình.')).toBeTruthy();
  expect(screen.queryByText(/tự.*đổi|bỏ.*giới hạn y tế/i)).toBeNull();
});

test('shows a loading state while the request is pending', async () => {
  let resolveRequest;
  api.createMyMealPlan.mockReturnValue(new Promise(resolve => { resolveRequest = resolve; }));
  const screen = render(<MealPlanScreen profile={profile} />);
  await screen.findByText(/Ưu tiên lưu: độ phong phú/);
  fireEvent.press(screen.getByText('Tạo thực đơn'));
  expect(screen.getByText('Đang tạo thực đơn')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Đang tạo thực đơn' }).props.accessibilityState?.disabled).toBe(true);
  await act(async () => { resolveRequest(persistedPlan); });
  await waitFor(() => expect(screen.getByText('Tạo danh sách đi chợ')).toBeTruthy());
});

test('shows a direct retry after a network error and repeats the same plan request', async () => {
  api.createMyMealPlan.mockRejectedValueOnce(new Error('API đang ngoại tuyến.')).mockResolvedValueOnce(persistedPlan);
  const screen = render(<MealPlanScreen profile={profile} />);

  await screen.findByText(/Ưu tiên lưu: độ phong phú/);
  await act(async () => { fireEvent.press(screen.getByText('Tạo thực đơn')); });
  expect(screen.getByText('API đang ngoại tuyến.')).toBeTruthy();
  const retry = screen.getByRole('button', { name: 'Thử lại tạo thực đơn' });
  expect(retry).toBeTruthy();

  await act(async () => { fireEvent.press(retry); });
  await waitFor(() => expect(screen.getByText('Tạo danh sách đi chợ')).toBeTruthy());
  expect(api.createMyMealPlan).toHaveBeenCalledTimes(2);
  expect(api.createMyMealPlan.mock.calls[1]).toEqual(api.createMyMealPlan.mock.calls[0]);
});
