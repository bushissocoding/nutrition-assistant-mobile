import React from 'react';
import { fireEvent, render } from '@testing-library/react-native';
import AppointmentScreen from './AppointmentScreen';

test('walks through doctor, schedule, and payment preview without submitting a real booking', () => {
  const onRequestCreate = jest.fn();
  const screen = render(<AppointmentScreen onRequestCreate={onRequestCreate} />);
  fireEvent.press(screen.getAllByText('Xem lịch')[0]);
  fireEvent.press(screen.getByText('Tiếp tục xem phương thức thanh toán'));
  fireEvent.press(screen.getByRole('radio', { name: 'PayPal' }));
  fireEvent.press(screen.getByText('Xem lại yêu cầu'));
  fireEvent.press(screen.getByText('Hoàn tất xem trước'));

  expect(screen.getByText(/không có lịch hẹn nào được gửi/i)).toBeTruthy();
  expect(screen.getByText(/chưa gửi/)).toBeTruthy();
  expect(onRequestCreate).toHaveBeenCalledWith(expect.objectContaining({ method: 'paypal' }));
});

test('removes a local request preview without claiming that a real appointment was cancelled', () => {
  const onRequestClear = jest.fn();
  const screen = render(<AppointmentScreen onRequestClear={onRequestClear} />);
  fireEvent.press(screen.getAllByText('Xem lịch')[0]);
  fireEvent.press(screen.getByText('Tiếp tục xem phương thức thanh toán'));
  fireEvent.press(screen.getByText('Xem lại yêu cầu'));
  fireEvent.press(screen.getByText('Hoàn tất xem trước'));
  fireEvent.press(screen.getByText('Xem lịch hẹn'));
  fireEvent.press(screen.getByText('Xóa yêu cầu demo'));
  fireEvent.press(screen.getByRole('radio', { name: 'Đổi lịch' }));
  fireEvent.press(screen.getByText('Xóa yêu cầu xem trước'));

  expect(onRequestClear).toHaveBeenCalledTimes(1);
  expect(screen.getByText('Chưa có lịch hẹn')).toBeTruthy();
});

test('opens a clearly labeled doctor chat preview from the provider details', () => {
  const onOpenDoctorChat = jest.fn();
  const screen = render(<AppointmentScreen onOpenDoctorChat={onOpenDoctorChat} />);
  fireEvent.press(screen.getByRole('button', { name: /Xem chi tiết PGS\.TS\. Trương Lê Quân/ }));
  fireEvent.press(screen.getByText('Xem trước giao diện trò chuyện'));

  expect(onOpenDoctorChat).toHaveBeenCalledWith(expect.objectContaining({ id: 'tran' }));
});
