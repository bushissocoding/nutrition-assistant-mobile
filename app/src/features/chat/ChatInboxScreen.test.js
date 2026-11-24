import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import { api } from '../../services/api';
import ChatInboxScreen from './ChatInboxScreen';

jest.mock('../../services/api', () => ({ api: {
  getMyAssistantThread: jest.fn(),
  getMyAppointments: jest.fn(),
  getMyAppointmentMessages: jest.fn(),
} }));

const account = { id: 'synthetic-patient-1' };
const appointment = {
  id: 'appointment-1',
  providerId: 'provider-1',
  provider: { name: 'Bác sĩ An' },
  startsAt: '2026-11-20T09:00:00.000Z',
  status: 'confirmed',
};

beforeEach(() => {
  jest.clearAllMocks();
  api.getMyAssistantThread.mockResolvedValue({ turns: [] });
  api.getMyAppointments.mockResolvedValue({ items: [] });
  api.getMyAppointmentMessages.mockResolvedValue({ items: [] });
});

test('shows the latest ViCi and eligible doctor message previews and opens the selected conversation', async () => {
  api.getMyAssistantThread.mockResolvedValue({ turns: [{
    id: 'turn-1', userMessage: 'Tôi nên ghi bữa ăn thế nào?', assistantMessage: 'Mở mục Nhật ký để bắt đầu.', createdAt: '2026-11-24T03:00:00.000Z',
  }] });
  api.getMyAppointments.mockResolvedValue({ items: [appointment] });
  api.getMyAppointmentMessages.mockResolvedValue({ items: [{
    id: 'message-1', senderUserId: 'provider-user-1', body: 'Tôi sẽ trao đổi trong buổi hẹn.', createdAt: '2026-11-23T08:30:00.000Z',
  }] });
  const onOpenAssistant = jest.fn();
  const onOpenDoctorChat = jest.fn();
  const screen = render(<ChatInboxScreen account={account} onOpenAssistant={onOpenAssistant} onOpenDoctorChat={onOpenDoctorChat} />);

  const assistantRow = await screen.findByRole('button', { name: /Trợ lý ảo ViCi/ });
  expect(assistantRow).toBeTruthy();
  expect(screen.getByText('ViCi: Mở mục Nhật ký để bắt đầu.')).toBeTruthy();
  expect(screen.getByText('Bác sĩ An')).toBeTruthy();
  expect(screen.getByText('Bác sĩ: Tôi sẽ trao đổi trong buổi hẹn.')).toBeTruthy();

  fireEvent.press(assistantRow);
  expect(onOpenAssistant).toHaveBeenCalledTimes(1);
  fireEvent.press(screen.getByRole('button', { name: /Bác sĩ An/ }));
  expect(onOpenDoctorChat).toHaveBeenCalledWith({
    id: 'provider-1', role: 'provider', name: 'Bác sĩ An', appointmentId: 'appointment-1',
  });
});

test('does not request conversations for appointments that cannot chat', async () => {
  api.getMyAppointments.mockResolvedValue({ items: [
    appointment,
    { ...appointment, id: 'cancelled-appointment', status: 'cancelled', provider: { name: 'Bác sĩ B' } },
    { ...appointment, id: 'awaiting-appointment', status: 'awaiting_payment', provider: { name: 'Bác sĩ C' } },
  ] });
  const screen = render(<ChatInboxScreen account={account} onOpenAssistant={jest.fn()} onOpenDoctorChat={jest.fn()} />);

  await waitFor(() => expect(api.getMyAppointmentMessages).toHaveBeenCalledTimes(1));
  expect(api.getMyAppointmentMessages).toHaveBeenCalledWith('appointment-1');
  expect(screen.queryByText('Bác sĩ B')).toBeNull();
  expect(screen.queryByText('Bác sĩ C')).toBeNull();
});

test('keeps available conversations visible and retries when one inbox source fails', async () => {
  api.getMyAssistantThread.mockResolvedValue({ turns: [{ id: 'turn-1', userMessage: 'Tóm tắt gần đây', assistantMessage: '' }] });
  api.getMyAppointments.mockRejectedValueOnce(new Error('Lỗi lịch hẹn')).mockResolvedValue({ items: [] });
  const screen = render(<ChatInboxScreen account={account} onOpenAssistant={jest.fn()} onOpenDoctorChat={jest.fn()} />);

  expect(await screen.findByText('Bạn: Tóm tắt gần đây')).toBeTruthy();
  expect(await screen.findByText('Không tải được một số hội thoại.')).toBeTruthy();
  fireEvent.press(screen.getByRole('button', { name: 'Tải lại' }));
  await waitFor(() => expect(api.getMyAppointments).toHaveBeenCalledTimes(2));
  expect(await screen.findByText('Bạn: Tóm tắt gần đây')).toBeTruthy();
  await waitFor(() => expect(screen.queryByText('Không tải được một số hội thoại.')).toBeNull());
});
