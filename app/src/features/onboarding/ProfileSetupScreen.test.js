import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import { StyleSheet } from 'react-native';
import ProfileSetupScreen from './ProfileSetupScreen';

function expectNativeStringsInsideText(node, insideText = false) {
  if (Array.isArray(node)) {
    node.forEach(child => expectNativeStringsInsideText(child, insideText));
    return;
  }
  if (typeof node === 'string' || typeof node === 'number') {
    expect(insideText).toBe(true);
    return;
  }
  if (!node || typeof node !== 'object') return;
  const isText = insideText || String(node.type).includes('Text');
  (node.children || []).forEach(child => expectNativeStringsInsideText(child, isText));
}

test('uses the shared page inset without a duplicate wizard offset', () => {
  const screen = render(<ProfileSetupScreen initialProfile={{ username: 'patient_1' }} onComplete={jest.fn()} />);

  expect(StyleSheet.flatten(screen.getByTestId('profile-setup-top-bar').props.style).paddingTop).toBe(12);
});

test('moves through the assessment wizard and saves only the completed demo profile', () => {
  const onComplete = jest.fn();
  const screen = render(<ProfileSetupScreen initialProfile={{ username: 'patient_1' }} onComplete={onComplete} />);

  fireEvent.press(screen.getByRole('radio', { name: 'Nam' }));
  fireEvent.press(screen.getByText(/Tiếp tục/));
  fireEvent.changeText(screen.getByLabelText('Cân nặng tính bằng kilogram'), '65');
  fireEvent.press(screen.getByText(/Tiếp tục/));
  fireEvent.changeText(screen.getByLabelText('Chiều cao tính bằng centimet'), '170');
  fireEvent.press(screen.getByText(/Tiếp tục/));
  fireEvent.changeText(screen.getByLabelText('Tuổi'), '30');
  fireEvent.press(screen.getByText(/Tiếp tục/));
  fireEvent.press(screen.getByRole('radio', { name: 'Suy thận cấp' }));
  fireEvent.press(screen.getByText(/Tiếp tục/));
  fireEvent.press(screen.getByText(/Tiếp tục/));
  fireEvent.changeText(screen.getByLabelText('Dị ứng hoặc thực phẩm cần tránh'), 'tôm');
  fireEvent.press(screen.getByRole('button', { name: /Lưu hồ sơ/ }));

  expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({
    gender: 'male', age: '30', heightCm: '170', weightKg: '65', conditionType: 'acute-kidney-disease', allergies: ['tôm'],
  }));
});

test('keeps measurement screen text inside Text components for native rendering', () => {
  const screen = render(<ProfileSetupScreen initialProfile={{ username: 'patient_1' }} onComplete={jest.fn()} />);

  fireEvent.press(screen.getByText('Bỏ qua'));

  expectNativeStringsInsideText(screen.toJSON());
});

test('keeps the wizard on the measurement step when a required value is invalid', () => {
  const screen = render(<ProfileSetupScreen onComplete={jest.fn()} />);
  fireEvent.press(screen.getByText(/Tiếp tục/));
  fireEvent.press(screen.getByText(/Tiếp tục/));

  expect(screen.getByText('Nhập cân nặng từ 2 đến 500 kg.')).toBeTruthy();
  expect(screen.getByLabelText('Cân nặng tính bằng kilogram')).toBeTruthy();
});

test('saves a complete profile with a Vietnamese display name containing spaces', () => {
  const onComplete = jest.fn();
  const screen = render(<ProfileSetupScreen initialProfile={{ username: 'Nguyễn Văn An', age: '30', heightCm: '170', weightKg: '65', activityLevel: 'moderate' }} onComplete={onComplete} />);

  fireEvent.press(screen.getByText('Bỏ qua'));
  fireEvent.press(screen.getByText(/Tiếp tục/));
  fireEvent.press(screen.getByText(/Tiếp tục/));
  fireEvent.press(screen.getByText(/Tiếp tục/));
  fireEvent.press(screen.getByText('Bỏ qua'));
  fireEvent.press(screen.getByText('Bỏ qua'));
  fireEvent.press(screen.getByText('Tôi không khai báo dị ứng'));
  fireEvent.press(screen.getByRole('button', { name: 'Lưu hồ sơ' }));

  expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ username: 'Nguyễn Văn An', age: '30', heightCm: '170', weightKg: '65' }));
  expect(screen.queryByText(/Tên người dùng gồm/)).toBeNull();
});

test('skipping optional steps preserves existing allergy exclusions and safety flags', () => {
  const onComplete = jest.fn();
  const initialProfile = { username: 'patient_1', mode: 'healthy', age: '30', heightCm: '170', weightKg: '65', activityLevel: 'moderate', allergies: ['tôm'], redFlags: ['chestPain'] };
  const screen = render(<ProfileSetupScreen initialProfile={initialProfile} onComplete={onComplete} />);

  fireEvent.press(screen.getByText('Bỏ qua'));
  fireEvent.press(screen.getByText(/Tiếp tục/));
  fireEvent.press(screen.getByText(/Tiếp tục/));
  fireEvent.press(screen.getByText(/Tiếp tục/));
  fireEvent.press(screen.getByText('Bỏ qua'));
  fireEvent.press(screen.getByText('Bỏ qua'));
  fireEvent.press(screen.getByText('Bỏ qua'));

  expect(onComplete).toHaveBeenCalledWith(expect.objectContaining({ allergies: ['tôm'], redFlags: ['chestPain'] }));
});
