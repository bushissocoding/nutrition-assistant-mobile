import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import ProfileSetupScreen from './ProfileSetupScreen';

test('moves through the assessment wizard and saves only the completed demo profile', () => {
  const onComplete = jest.fn();
  const screen = render(<ProfileSetupScreen onComplete={onComplete} />);

  fireEvent.press(screen.getByRole('radio', { name: 'Nam' }));
  fireEvent.press(screen.getByText(/Tiếp tục/));
  fireEvent.changeText(screen.getByLabelText('Cân nặng tính bằng kilogram'), '65');
  fireEvent.press(screen.getByText(/Tiếp tục/));
  fireEvent.changeText(screen.getByLabelText('Chiều cao tính bằng centimet'), '170');
  fireEvent.press(screen.getByText(/Tiếp tục/));
  fireEvent.changeText(screen.getByLabelText('Tuổi'), '30');
  fireEvent.press(screen.getByText(/Tiếp tục/));
  fireEvent.press(screen.getByText(/Tiếp tục/));
  fireEvent.changeText(screen.getByLabelText('Dị ứng hoặc thực phẩm cần tránh'), 'tôm');
  fireEvent.press(screen.getByRole('button', { name: /Lưu hồ sơ demo/ }));

  expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({
    gender: 'male', age: '30', heightCm: '170', weightKg: '65', allergies: ['tôm'],
  }));
});

test('keeps the wizard on the measurement step when a required value is invalid', () => {
  const screen = render(<ProfileSetupScreen onComplete={jest.fn()} />);
  fireEvent.press(screen.getByText(/Tiếp tục/));
  fireEvent.press(screen.getByText(/Tiếp tục/));

  expect(screen.getByText('Nhập cân nặng từ 2 đến 500 kg.')).toBeTruthy();
  expect(screen.getByLabelText('Cân nặng tính bằng kilogram')).toBeTruthy();
});

test('skipping optional steps preserves existing allergy exclusions and safety flags', () => {
  const onComplete = jest.fn();
  const initialProfile = { mode: 'healthy', age: '30', heightCm: '170', weightKg: '65', activityLevel: 'moderate', allergies: ['tôm'], redFlags: ['chestPain'] };
  const screen = render(<ProfileSetupScreen initialProfile={initialProfile} onComplete={onComplete} />);

  fireEvent.press(screen.getByText('Bỏ qua'));
  fireEvent.press(screen.getByText(/Tiếp tục/));
  fireEvent.press(screen.getByText(/Tiếp tục/));
  fireEvent.press(screen.getByText(/Tiếp tục/));
  fireEvent.press(screen.getByText('Bỏ qua'));
  fireEvent.press(screen.getByText('Bỏ qua'));

  expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ allergies: ['tôm'], redFlags: ['chestPain'] }));
});
