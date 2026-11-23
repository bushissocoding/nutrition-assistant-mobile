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

test('keeps patient and preliminary symptom fields in the local preview only', () => {
  const onRequestCreate = jest.fn();
  const screen = render(<AppointmentScreen onRequestCreate={onRequestCreate} />);
  fireEvent.press(screen.getByRole('button', { name: /Xem chi tiết PGS\.TS\. Trương Lê Quân/ }));
  fireEvent.press(screen.getByText('Chọn lịch hẹn demo'));
  fireEvent.changeText(screen.getByLabelText('Tên bệnh nhân demo'), 'Người dùng mẫu');
  fireEvent.changeText(screen.getByLabelText('Triệu chứng sơ bộ demo'), 'Ghi chú tổng hợp cho giao diện.');
  fireEvent.press(screen.getByText('Tiếp tục xem phương thức thanh toán'));
  fireEvent.press(screen.getByText('Xem lại yêu cầu'));

  expect(screen.getByText('Người bệnh demo: Người dùng mẫu')).toBeTruthy();
  expect(screen.getByText('Ghi chú sơ bộ: Đã nhập trong phiên demo')).toBeTruthy();
  fireEvent.press(screen.getByText('Hoàn tất xem trước'));
  expect(onRequestCreate).toHaveBeenCalledWith(expect.objectContaining({ patientName: 'Người dùng mẫu', symptomNote: 'Ghi chú tổng hợp cho giao diện.' }));
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
  const bookingRequest = { doctor: 'PGS.TS. Trương Lê Quân', date: '2026-12-01', time: '10:00' };
  const screen = render(<AppointmentScreen request={bookingRequest} onOpenDoctorChat={onOpenDoctorChat} />);
  fireEvent.press(screen.getByRole('button', { name: /Xem chi tiết PGS\.TS\. Trương Lê Quân/ }));
  fireEvent.press(screen.getByText('Xem trước giao diện trò chuyện'));

  expect(onOpenDoctorChat).toHaveBeenCalledWith(expect.objectContaining({ id: 'tran' }));
});

test('does not expose doctor chat before a booking preview exists', () => {
  const onOpenDoctorChat = jest.fn();
  const screen = render(<AppointmentScreen onOpenDoctorChat={onOpenDoctorChat} />);
  fireEvent.press(screen.getByRole('button', { name: /Xem chi tiết PGS\.TS\. Trương Lê Quân/ }));

  expect(screen.queryByText('Xem trước giao diện trò chuyện')).toBeNull();
  expect(onOpenDoctorChat).not.toHaveBeenCalled();
});

test('does not expose a different provider chat for another provider booking', () => {
  const bookingRequest = { doctor: 'PGS.TS. Nguyễn Tuấn Nghĩa', date: '2026-12-01', time: '10:00' };
  const screen = render(<AppointmentScreen request={bookingRequest} />);

  fireEvent.press(screen.getByRole('button', { name: /Xem chi tiết PGS\.TS\. Trương Lê Quân/ }));

  expect(screen.queryByText('Xem trước giao diện trò chuyện')).toBeNull();
});

test('removes provider chat access after cancelling its booking preview', () => {
  const bookingRequest = { doctor: 'PGS.TS. Trương Lê Quân', date: '2026-12-01', time: '10:00' };
  const screen = render(<AppointmentScreen initialView="appointments-list" request={bookingRequest} />);

  fireEvent.press(screen.getByText('Xóa yêu cầu demo'));
  fireEvent.press(screen.getByRole('radio', { name: 'Đổi lịch' }));
  fireEvent.press(screen.getByText('Xóa yêu cầu xem trước'));
  fireEvent.press(screen.getByText('Tìm bác sĩ (demo)'));
  fireEvent.press(screen.getByRole('button', { name: /Xem chi tiết PGS\.TS\. Trương Lê Quân/ }));

  expect(screen.queryByText('Xem trước giao diện trò chuyện')).toBeNull();
});
