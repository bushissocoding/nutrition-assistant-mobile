import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import PersonalizationScreen from './PersonalizationScreen';

test('shows editable demo health measurements and condition before preference controls', () => {
  const onEditProfile = jest.fn();
  const screen = render(<PersonalizationScreen profile={{ mode: 'healthy', age: 30, heightCm: 170, weightKg: 70, conditionType: 'diabetes', allergies: ['Đậu phộng'], hardLimits: {} }} onEditProfile={onEditProfile} />);

  expect(screen.getByText('Hồ sơ sức khỏe')).toBeTruthy();
  expect(screen.getByText('170 cm')).toBeTruthy();
  expect(screen.getByText('70 kg')).toBeTruthy();
  expect(screen.getByText('Tiểu đường')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'Chỉnh sửa hồ sơ sức khỏe' }));
  expect(onEditProfile).toHaveBeenCalledTimes(1);
});

test('keeps scan and result screens explicit that no lab image was processed', () => {
  const screen = render(<PersonalizationScreen />);
  fireEvent.press(screen.getByText('Thêm kết quả xét nghiệm'));
  expect(screen.getByText('Chưa có ảnh mẫu')).toBeTruthy();
  expect(screen.getByText(/Camera và nhận diện ảnh chưa được kết nối/i)).toBeTruthy();
  fireEvent.press(screen.getByText('Xem trạng thái kết quả'));
  expect(screen.getByText('Chưa có kết quả xét nghiệm demo')).toBeTruthy();
  expect(screen.getAllByText('Chưa có dữ liệu')).toHaveLength(3);
});
