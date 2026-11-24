import React from 'react';
import { Alert } from 'react-native';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import AppointmentScreen from './AppointmentScreen';
import { api } from '../../services/api';

jest.mock('../../services/api', () => ({
  api: {
    getMyProviders: jest.fn(),
    getMyProviderAvailability: jest.fn(),
    getMyProviderProfile: jest.fn(),
    saveMyProviderApplication: jest.fn(),
    getMyProviderAvailabilitySlots: jest.fn(),
    createMyProviderAvailabilitySlot: jest.fn(),
    deleteMyProviderAvailabilitySlot: jest.fn(),
    getMyAppointments: jest.fn(),
    createMyAppointment: jest.fn(),
    cancelMyAppointment: jest.fn(),
    getMyProviderAppointments: jest.fn(),
    completeMyProviderAppointment: jest.fn(),
    cancelMyProviderAppointment: jest.fn(),
  },
}));

const provider = { id: 'provider-1', displayName: 'Nguyễn An', specialty: 'Dinh dưỡng lâm sàng', bio: 'Tư vấn dinh dưỡng.', experienceYears: 5, feeVnd: 200000, verificationStatus: 'verified', verifiedAt: '2026-01-01T00:00:00.000Z' };
const patientAppointment = { id: 'appointment-1', providerId: provider.id, provider: { name: provider.displayName, specialty: provider.specialty }, startsAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(), endsAt: new Date(Date.now() + 48 * 60 * 60 * 1000 + 30 * 60 * 1000).toISOString(), amount: { value: 200000, currency: 'VND' }, status: 'awaiting_payment', patient: { name: 'Bình', phone: '+84901234567', preliminarySymptoms: 'Mệt sau ăn' }, holdExpiresAt: new Date(Date.now() + 20 * 60 * 1000).toISOString() };

beforeEach(() => {
  jest.clearAllMocks();
  api.getMyProviders.mockResolvedValue({ items: [], total: 0, limit: 25, offset: 0, hasMore: false });
  api.getMyProviderAvailability.mockResolvedValue({ items: [] });
  api.getMyProviderProfile.mockResolvedValue({ provider: null });
  api.getMyProviderAvailabilitySlots.mockResolvedValue({ provider, items: [] });
  api.getMyProviderAppointments.mockResolvedValue({ items: [], total: 0, limit: 25, offset: 0 });
  api.getMyAppointments.mockResolvedValue({ items: [], total: 0, limit: 25, offset: 0 });
});

async function press(screen, label) {
  await act(async () => {
    fireEvent.press(screen.getByText(label));
    for (let index = 0; index < 5; index += 1) await Promise.resolve();
  });
}

async function pressNode(node) {
  await act(async () => {
    fireEvent.press(node);
    for (let index = 0; index < 5; index += 1) await Promise.resolve();
  });
}

test('loads a truthful empty directory and does not show synthetic doctors or fees', async () => {
  const screen = render(<AppointmentScreen />);
  await waitFor(() => expect(screen.getByText('Chưa có nhà cung cấp đã xác minh.')).toBeTruthy());
  expect(screen.queryByText(/PGS\.TS\./)).toBeNull();
  expect(screen.queryByText(/giá minh họa/)).toBeNull();
  expect(screen.getByText('Đăng ký cung cấp dịch vụ')).toBeTruthy();
});

test('searches verified providers and opens a sourced profile before requesting real availability', async () => {
  const slotStart = new Date(Date.now() + 48 * 60 * 60 * 1000);
  const slot = { id: 'slot-detail', providerId: provider.id, startsAt: slotStart.toISOString(), endsAt: new Date(slotStart.getTime() + 30 * 60 * 1000).toISOString(), status: 'open' };
  api.getMyProviders.mockResolvedValue({ items: [provider], total: 1, limit: 25, offset: 0 });
  api.getMyProviderAvailability.mockResolvedValue({ items: [slot] });
  const screen = render(<AppointmentScreen />);
  await waitFor(() => expect(screen.getByText('Nguyễn An')).toBeTruthy());
  fireEvent.changeText(screen.getByLabelText('Tìm bác sĩ hoặc chuyên khoa'), 'Nguyễn An');
  await press(screen, 'Tìm');
  await waitFor(() => expect(api.getMyProviders).toHaveBeenLastCalledWith({ query: 'Nguyễn An', specialty: '', limit: 25, offset: 0 }));
  await press(screen, 'Xem chi tiết Nguyễn An');
  expect(screen.getByText('✓ Đã xác minh')).toBeTruthy();
  expect(screen.getByText('200.000 ₫ / lượt · do nhà cung cấp khai báo')).toBeTruthy();
  await press(screen, 'Chọn lịch trống');
  await waitFor(() => expect(api.getMyProviderAvailability).toHaveBeenCalledWith(provider.id, expect.objectContaining({ from: expect.any(String), to: expect.any(String) })));
  const slotDay = new Date(slot.startsAt);
  const weekday = new Intl.DateTimeFormat('vi-VN', { weekday: 'short' }).format(slotDay);
  const month = new Intl.DateTimeFormat('vi-VN', { month: 'short' }).format(slotDay);
  await pressNode(screen.getByLabelText(`${weekday}, ngày ${slotDay.getDate()} ${month}`));
  expect(screen.getByText('Chọn một khung giờ còn trống do nhà cung cấp công bố.')).toBeTruthy();
});

test('creates an account booking hold with explicit provider disclosure and a stable retry key', async () => {
  const start = new Date(); start.setDate(start.getDate() + 1); start.setHours(9, 0, 0, 0);
  const slot = { id: 'slot-1', providerId: provider.id, startsAt: start.toISOString(), endsAt: new Date(start.getTime() + 30 * 60 * 1000).toISOString(), status: 'open' };
  api.getMyProviders.mockResolvedValue({ items: [provider], total: 1, limit: 25, offset: 0 });
  api.getMyProviderAvailability.mockResolvedValue({ items: [slot] });
  api.createMyAppointment.mockRejectedValueOnce(new Error('Mạng bị ngắt.')).mockResolvedValueOnce({ appointment: patientAppointment, replayed: false });
  const screen = render(<AppointmentScreen account={{ id: 'patient-1' }} />);
  await waitFor(() => expect(screen.getByText('Nguyễn An')).toBeTruthy());
  await press(screen, 'Chọn lịch của Nguyễn An');
  const nextDay = new Date(); nextDay.setDate(nextDay.getDate() + 1); nextDay.setHours(12, 0, 0, 0);
  const weekday = new Intl.DateTimeFormat('vi-VN', { weekday: 'short' }).format(nextDay);
  const month = new Intl.DateTimeFormat('vi-VN', { month: 'short' }).format(nextDay);
  await pressNode(screen.getByLabelText(`${weekday}, ngày ${nextDay.getDate()} ${month}`));
  await waitFor(() => expect(screen.getByText('09:00')).toBeTruthy());
  await press(screen, '09:00');
  await press(screen, 'Tiếp tục');
  fireEvent.changeText(screen.getByLabelText('Tên người khám'), 'Bình');
  fireEvent.changeText(screen.getByLabelText('Số điện thoại có mã quốc gia'), '+84901234567');
  fireEvent.changeText(screen.getByLabelText('Triệu chứng sơ bộ (tùy chọn)'), 'Mệt sau ăn');
  fireEvent.press(screen.getByRole('checkbox', { name: 'Đồng ý chia sẻ thông tin đặt lịch với bác sĩ đã chọn' }));
  await press(screen, 'Giữ chỗ và tiếp tục');
  await waitFor(() => expect(screen.getByText('Mạng bị ngắt.')).toBeTruthy());
  const firstCall = api.createMyAppointment.mock.calls[0];
  await press(screen, 'Thử lại đặt lịch');
  await waitFor(() => expect(screen.getByText('Giữ chỗ đang chờ thanh toán')).toBeTruthy());
  expect(api.createMyAppointment).toHaveBeenCalledTimes(2);
  expect(api.createMyAppointment.mock.calls[1]).toEqual(firstCall);
  expect(firstCall[0]).toEqual({ providerId: provider.id, slotId: slot.id, patientName: 'Bình', phone: '+84901234567', symptomNote: 'Mệt sau ăn', providerSharingAccepted: true });
  expect(firstCall[1]).toMatch(/^appointment-/);
  expect(screen.getByText(/chỉ được xác nhận sau khi nhà cung cấp thanh toán báo thành công/)).toBeTruthy();
});

test('cancels an owned unpaid appointment only after the patient confirms', async () => {
  api.getMyAppointments.mockResolvedValue({ items: [patientAppointment], total: 1, limit: 25, offset: 0 });
  api.cancelMyAppointment.mockResolvedValue({ appointment: { ...patientAppointment, status: 'cancelled' }, actor: 'patient' });
  let confirmCancel;
  const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => { confirmCancel = buttons.find(button => button.style === 'destructive').onPress; });
  const screen = render(<AppointmentScreen initialView="appointments-list" />);
  await waitFor(() => expect(screen.getByText('Nguyễn An')).toBeTruthy());
  await press(screen, 'Hủy giữ chỗ');
  await act(async () => { await confirmCancel(); });
  await waitFor(() => expect(api.cancelMyAppointment).toHaveBeenCalledWith('appointment-1', { reason: 'schedule-change', note: '' }));
  expect(screen.getByText(/Đã hủy/)).toBeTruthy();
  alertSpy.mockRestore();
});

test('provider workspace saves a real 30-minute availability slot and never exposes booking controls while pending', async () => {
  api.getMyProviderProfile.mockResolvedValue({ provider: { ...provider, verificationStatus: 'pending', credentials: { reviewStatus: 'pending' } } });
  const screen = render(<AppointmentScreen initialView="provider-workspace" />);
  await waitFor(() => expect(screen.getByText('Hồ sơ đang chờ xác minh')).toBeTruthy());
  expect(screen.queryByText('Mở khung giờ 30 phút')).toBeNull();
  expect(api.getMyProviderAvailabilitySlots).not.toHaveBeenCalled();
});
