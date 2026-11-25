import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { parseDateOfBirthInput } from './profile-model.cjs';
import PersonalInfoScreen from './PersonalInfoScreen';

const profile = { username: 'Gia Khang', age: 16, dateOfBirth: null, heightCm: 170, weightKg: 65, mode: 'healthy', allergies: [] };
const account = { email: 'khang@example.test', phone: '+84901234567' };

test('shows the date-of-birth field and keeps account email and phone read-only', () => {
  const screen = render(<PersonalInfoScreen profile={profile} account={account} />);

  expect(screen.getByText('Gia Khang')).toBeTruthy();
  expect(screen.getByText('+84901234567')).toBeTruthy();
  expect(screen.getByText('khang@example.test')).toBeTruthy();
  expect(screen.getByText('Chưa cung cấp')).toBeTruthy();
  expect(screen.queryByText('16 tuổi')).toBeNull();
  expect(screen.getByText(/không tự suy ra ngày sinh/i)).toBeTruthy();
  expect(screen.queryByLabelText('Email')).toBeNull();
});

test('cancel discards an edited draft and keeps the saved profile unchanged', () => {
  const onSave = jest.fn();
  const screen = render(<PersonalInfoScreen profile={profile} account={account} onSave={onSave} />);

  fireEvent.press(screen.getByRole('button', { name: 'Cập nhật' }));
  fireEvent.changeText(screen.getByLabelText('Họ và tên'), 'Tên khác');
  fireEvent.changeText(screen.getByLabelText('Ngày sinh'), '01/01/1990');
  fireEvent.press(screen.getByRole('button', { name: 'Hủy thay đổi' }));

  expect(screen.getByText('Gia Khang')).toBeTruthy();
  expect(screen.getByText('Chưa cung cấp')).toBeTruthy();
  expect(onSave).not.toHaveBeenCalled();
});

test('saves an edited date of birth and updates the existing age field', async () => {
  const onSave = jest.fn().mockResolvedValue(undefined);
  const screen = render(<PersonalInfoScreen profile={profile} account={account} onSave={onSave} />);
  const today = new Date();
  const birthDateInput = `${String(today.getDate()).padStart(2, '0')}/${String(today.getMonth() + 1).padStart(2, '0')}/${today.getFullYear() - 20}`;
  const parsedBirthDate = parseDateOfBirthInput(birthDateInput);

  fireEvent.press(screen.getByRole('button', { name: 'Cập nhật' }));
  fireEvent.changeText(screen.getByLabelText('Họ và tên'), 'Khang Nguyen');
  fireEvent.changeText(screen.getByLabelText('Ngày sinh'), birthDateInput);
  fireEvent.press(screen.getByRole('button', { name: 'Lưu thay đổi' }));

  await waitFor(() => expect(onSave).toHaveBeenCalledWith(expect.objectContaining({ username: 'Khang Nguyen', dateOfBirth: parsedBirthDate.iso, age: parsedBirthDate.age })));
  expect(await screen.findByRole('button', { name: 'Cập nhật' })).toBeTruthy();
  expect(screen.getByText('Khang Nguyen')).toBeTruthy();
});

test('rejects an invalid date of birth without saving', () => {
  const onSave = jest.fn();
  const screen = render(<PersonalInfoScreen profile={profile} account={account} onSave={onSave} />);

  fireEvent.press(screen.getByRole('button', { name: 'Cập nhật' }));
  fireEvent.changeText(screen.getByLabelText('Ngày sinh'), '31/02/2010');
  fireEvent.press(screen.getByRole('button', { name: 'Lưu thay đổi' }));

  expect(screen.getByText(/ngày sinh hợp lệ/i)).toBeTruthy();
  expect(onSave).not.toHaveBeenCalled();
});
