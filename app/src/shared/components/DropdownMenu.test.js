import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import DropdownMenu, { getDropdownPlacement, getDropdownScrollOffset } from './DropdownMenu';

test('positions the menu under its trigger when there is room and above it otherwise', () => {
  expect(getDropdownPlacement({ x: 24, y: 100, width: 120, height: 44 }, { width: 390, height: 800 }, 8)).toEqual({
    top: 150,
    left: 24,
    width: 190,
  });
  expect(getDropdownPlacement({ x: 260, y: 690, width: 110, height: 44 }, { width: 390, height: 800 }, 8)).toEqual({
    top: 424,
    left: 188,
    width: 190,
  });
});

test('scrolls a long list to keep the selected option visible near the center', () => {
  expect(getDropdownScrollOffset(0)).toBe(0);
  expect(getDropdownScrollOffset(4)).toBe(104);
  expect(getDropdownScrollOffset(7)).toBe(260);
});

test('shows a scrollable menu capped at five rows and returns the selection before closing', () => {
  const onSelect = jest.fn();
  const onClose = jest.fn();
  const anchorRef = { current: { measureInWindow: callback => callback(20, 100, 140, 44) } };
  const screen = render(<DropdownMenu
    visible
    title="Chọn tháng"
    selectedValue="2024-1"
    options={Array.from({ length: 8 }, (_, index) => ({ value: `2024-${index + 1}`, label: `Month ${index + 1}` }))}
    anchorRef={anchorRef}
    onSelect={onSelect}
    onClose={onClose}
  />);

  expect(screen.getByTestId('dropdown-menu').props.accessibilityLabel).toBe('Chọn tháng');
  expect(screen.getByTestId('dropdown-options').props.style.maxHeight).toBe(260);
  expect(screen.getByRole('button', { name: 'Month 1' }).props.accessibilityState.selected).toBe(true);
  fireEvent.press(screen.getByRole('button', { name: 'Month 2' }));

  expect(onSelect).toHaveBeenCalledWith('2024-2');
  expect(onClose).toHaveBeenCalledTimes(1);
});

test('closes when the user taps outside the option list', () => {
  const onClose = jest.fn();
  const screen = render(<DropdownMenu
    visible
    title="Chọn tháng"
    selectedValue="2024-1"
    options={[{ value: '2024-1', label: 'Month 1' }, { value: '2024-2', label: 'Month 2' }]}
    onClose={onClose}
  />);

  fireEvent.press(screen.getByRole('button', { name: 'Đóng danh sách lựa chọn' }));
  expect(onClose).toHaveBeenCalledTimes(1);
});
