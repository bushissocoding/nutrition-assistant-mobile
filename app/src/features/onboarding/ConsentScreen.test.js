import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import ConsentScreen from './ConsentScreen';
import { CONSENT_CHOICES } from './consent-model.cjs';

test('blocks onboarding until every required consent choice is selected', () => {
  const onContinue = jest.fn();
  const screen = render(<ConsentScreen onContinue={onContinue} />);
  const continueButton = screen.getByRole('button', { name: 'Lưu lựa chọn và tiếp tục' });

  expect(continueButton.props.accessibilityState.disabled).toBe(true);
  fireEvent.press(continueButton);
  expect(onContinue).not.toHaveBeenCalled();

  for (const choice of CONSENT_CHOICES) fireEvent.press(screen.getByRole('checkbox', { name: choice.label }));

  expect(screen.getByRole('button', { name: 'Lưu lựa chọn và tiếp tục' }).props.accessibilityState.disabled).toBe(false);
  fireEvent.press(screen.getByRole('button', { name: 'Lưu lựa chọn và tiếp tục' }));
  expect(onContinue).toHaveBeenCalledWith(Object.fromEntries(CONSENT_CHOICES.map(({ key }) => [key, true])));
});

test('shows storage, retention, withdrawal disclosures and supports returning to the previous step', () => {
  const onBack = jest.fn();
  const screen = render(<ConsentScreen onContinue={jest.fn()} onBack={onBack} initialChoices={Object.fromEntries(CONSENT_CHOICES.map(({ key }) => [key, true]))} />);

  expect(screen.getAllByText(/thời hạn/i).length).toBeGreaterThan(0);
  expect(screen.getByText(/gắn với tài khoản/i)).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'Quay lại' }));
  expect(onBack).toHaveBeenCalledTimes(1);
});
