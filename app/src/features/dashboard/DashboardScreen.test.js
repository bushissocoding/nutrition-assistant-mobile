import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import DashboardScreen from './DashboardScreen';

test('shows report values from the current diary response', () => {
  const screen = render(<DashboardScreen diary={[{ id: 'entry-1' }]} diaryTotals={{ proteinG: 62, fatG: 40, fiberG: 32, carbohydrateG: 180, energyKcal: 1550 }} />);

  expect(screen.getByText('62 g')).toBeTruthy();
  expect(screen.getByText('40 g')).toBeTruthy();
  expect(screen.getByText('32 g')).toBeTruthy();
  expect(screen.getByText('180 g')).toBeTruthy();
  expect(screen.getByText('1550 kcal')).toBeTruthy();
  expect(screen.getByText('1 món đã ghi')).toBeTruthy();
  expect(screen.getByText(/các ngày trước chưa được tải/i)).toBeTruthy();
});

test('cycles the seven-day chart metric without inventing previous-day values', () => {
  const screen = render(<DashboardScreen diaryTotals={{ proteinG: 62, fatG: 40 }} />);

  expect(screen.getByRole('button', { name: 'Chỉ số đang xem: Protein' })).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'Chỉ số đang xem: Protein' }));
  expect(screen.getByRole('button', { name: 'Chỉ số đang xem: Lipid' })).toBeTruthy();
  expect(screen.getByText(/các ngày trước chưa được tải/i)).toBeTruthy();
});
