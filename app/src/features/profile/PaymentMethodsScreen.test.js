import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import PaymentMethodsScreen from './PaymentMethodsScreen';

test('shows the payment choices from the design reference', () => {
  const screen = render(<PaymentMethodsScreen />);

  expect(screen.getByRole('header', { name: 'Thanh Toán' })).toBeTruthy();
  expect(screen.getByText('Thẻ Tín Dụng/Ghi Nợ')).toBeTruthy();
  expect(screen.getByRole('radio', { name: 'Thêm Thẻ Mới' })).toBeTruthy();
  expect(screen.getByRole('radio', { name: 'Apple Pay' })).toBeTruthy();
  expect(screen.getByRole('radio', { name: 'PayPal' })).toBeTruthy();
  expect(screen.getByRole('radio', { name: 'Google Pay' })).toBeTruthy();
});

test('opens the add-card form, validates input, and only keeps a masked preview', () => {
  const screen = render(<PaymentMethodsScreen />);

  fireEvent.press(screen.getByRole('radio', { name: 'Thêm Thẻ Mới' }));
  expect(screen.getByRole('header', { name: 'Thêm Thẻ' })).toBeTruthy();
  expect(screen.getByLabelText('Tên Chủ Thẻ')).toBeTruthy();
  expect(screen.getByLabelText('Số Thẻ')).toBeTruthy();
  expect(screen.getByLabelText('Hạn Dùng')).toBeTruthy();
  expect(screen.getByLabelText('CVV')).toBeTruthy();
  expect(screen.getByText(/thông tin thẻ không được gửi/i)).toBeTruthy();

  fireEvent.press(screen.getByRole('button', { name: 'Lưu Thẻ' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Vui lòng nhập đủ thông tin theo mẫu.');

  fireEvent.changeText(screen.getByLabelText('Tên Chủ Thẻ'), 'Nguyen Van A');
  fireEvent.changeText(screen.getByLabelText('Số Thẻ'), '4242424242424242');
  fireEvent.changeText(screen.getByLabelText('Hạn Dùng'), '0428');
  fireEvent.changeText(screen.getByLabelText('CVV'), '123');
  fireEvent.press(screen.getByRole('button', { name: 'Lưu Thẻ' }));

  expect(screen.getByRole('header', { name: 'Thanh Toán' })).toBeTruthy();
  expect(screen.getByRole('radio', { name: 'Thẻ •••• 4242' })).toBeTruthy();
  expect(screen.queryByText('4242 4242 4242 4242')).toBeNull();
});

test('returns from the payment methods screen when its back button is pressed', () => {
  const onBack = jest.fn();
  const screen = render(<PaymentMethodsScreen onBack={onBack} />);

  fireEvent.press(screen.getByRole('button', { name: 'Quay lại' }));

  expect(onBack).toHaveBeenCalledTimes(1);
});
