import React from 'react';
import { act, render } from '@testing-library/react-native';
import LaunchScreen from './LaunchScreen';

afterEach(() => jest.useRealTimers());

test('shows the splash, loading and welcome quote before continuing', () => {
  jest.useFakeTimers();
  const onComplete = jest.fn();
  const screen = render(<LaunchScreen onComplete={onComplete} ready />);

  expect(screen.getByText('THIẾT KẾ BỞI NHÓM 05')).toBeTruthy();
  act(() => jest.advanceTimersByTime(650));
  expect(screen.getByText('Đang tải…')).toBeTruthy();
  act(() => jest.advanceTimersByTime(900));
  expect(screen.getByText(/Sức khỏe là sự hài hòa/)).toBeTruthy();
  act(() => jest.advanceTimersByTime(900));
  expect(onComplete).toHaveBeenCalledTimes(1);
});
