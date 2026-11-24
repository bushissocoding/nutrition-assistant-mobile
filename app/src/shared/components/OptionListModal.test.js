import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import OptionListModal from './OptionListModal';

test('shows the selected option and returns a choice before closing', () => {
  const onSelect = jest.fn();
  const onClose = jest.fn();
  const screen = render(<OptionListModal
    visible
    title="Chọn tháng"
    selectedValue="2024-03"
    options={[{ value: '2024-03', label: 'Mar-2024' }, { value: '2024-04', label: 'Apr-2024' }]}
    onSelect={onSelect}
    onClose={onClose}
  />);

  expect(screen.getByText('Chọn tháng')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Mar-2024' }).props.accessibilityState.selected).toBe(true);
  fireEvent.press(screen.getByRole('button', { name: 'Apr-2024' }));

  expect(onSelect).toHaveBeenCalledWith('2024-04');
  expect(onClose).toHaveBeenCalledTimes(1);
});
