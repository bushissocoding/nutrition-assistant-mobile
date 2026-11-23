import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import HomeScreen from './HomeScreen';

test('shows the eight designed shortcuts and routes them to their matching features', () => {
  const onNavigate = jest.fn();
  const screen = render(<HomeScreen onNavigate={onNavigate} />);

  expect(screen.getByRole('button', { name: 'Đặt khám' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Lịch hẹn' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Hồ sơ y tế' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Thực đơn' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Nhật ký' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Đi chợ' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Cá nhân hóa' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Hướng dẫn' })).toBeTruthy();

  fireEvent.press(screen.getByRole('button', { name: 'Đi chợ' }));
  expect(onNavigate).toHaveBeenCalledWith('grocery');
});

test('shows diary data on today and a clear empty state when another day is selected', () => {
  const screen = render(<HomeScreen onNavigate={jest.fn()} diary={[
    { id: 'meal-1', mealType: 'BREAKFAST', foodName: 'Cơm gạo lứt', nutrients: { energyKcal: 195 } },
  ]} />);

  expect(screen.getByText('Cơm gạo lứt')).toBeTruthy();
  expect(screen.getByText('195 kcal')).toBeTruthy();
  expect(screen.getAllByText('Chưa ghi món ăn')).toHaveLength(2);

  const anotherDay = new Date();
  anotherDay.setDate(anotherDay.getDate() + 1);
  const weekDay = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][anotherDay.getDay()];
  fireEvent.press(screen.getByRole('tab', { name: `${weekDay} ${anotherDay.getDate()}` }));
  expect(screen.getAllByText('Chưa có dữ liệu cho ngày này')).toHaveLength(3);
});
