import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import SettingsScreen from './SettingsScreen';

test('notification preferences expose switches with working selected states', () => {
  const screen = render(<SettingsScreen screen="settings-notifications" />);
  const sound = screen.getByRole('switch', { name: 'Âm thanh' });
  expect(sound.props.accessibilityState.checked).toBe(false);
  fireEvent.press(sound);
  expect(screen.getByRole('switch', { name: 'Âm thanh' }).props.accessibilityState.checked).toBe(true);
});

test('help questions expand to show the prototype service boundary', () => {
  const screen = render(<SettingsScreen screen="settings-help" />);
  fireEvent.press(screen.getByText('Ứng dụng có tư vấn y tế không?'));
  expect(screen.getByText(/không chẩn đoán hoặc điều trị/i)).toBeTruthy();
});
