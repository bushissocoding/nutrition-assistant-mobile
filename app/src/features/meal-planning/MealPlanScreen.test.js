import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import MealPlanScreen from './MealPlanScreen';
import { api } from '../../services/api';

jest.mock('../../services/api', () => ({ api: { generateMealPlan: jest.fn() } }));

const profile = { mode: 'healthy', allergies: [], redFlags: [] };
const generatedPlan = {
  plan: [], warnings: [], dailyTotals: { energyKcal: 0, proteinG: 0, carbohydrateG: 0, fatG: 0, fiberG: 0, sodiumMg: 0 },
  estimatedCostVnd: 0, grocery: [{ foodId: 'rice-steamed', name: 'Cơm trắng', grams: 300 }], limitations: [],
};

test('opens a saved grocery list from the planner even before generating a new plan', () => {
  const onOpenGrocery = jest.fn();
  const screen = render(<MealPlanScreen profile={profile} onOpenGrocery={onOpenGrocery} />);
  fireEvent.press(screen.getByText('Mở danh sách đi chợ đã lưu'));
  expect(onOpenGrocery).toHaveBeenCalledWith();
});

test('passes the backend grocery snapshot to the create-list flow', async () => {
  const onOpenGrocery = jest.fn();
  api.generateMealPlan.mockResolvedValue(generatedPlan);
  const screen = render(<MealPlanScreen profile={profile} onOpenGrocery={onOpenGrocery} />);

  await act(async () => { fireEvent.press(screen.getByText('Tạo thực đơn')); });
  await waitFor(() => expect(screen.getByText('Tạo danh sách đi chợ')).toBeTruthy());
  fireEvent.press(screen.getByText('Tạo danh sách đi chợ'));
  expect(onOpenGrocery).toHaveBeenCalledWith(generatedPlan.grocery);
});
