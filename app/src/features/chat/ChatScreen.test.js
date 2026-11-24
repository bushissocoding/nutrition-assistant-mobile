import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import ChatScreen from './ChatScreen';
import { api } from '../../services/api';

jest.mock('../../services/api', () => ({ api: {
  getMyAssistantThread: jest.fn(), saveMyAssistantConsent: jest.fn(), sendMyAssistantTurn: jest.fn(),
  getMyAppointmentMessages: jest.fn(), sendMyAppointmentMessage: jest.fn(),
} }));

beforeEach(() => {
  jest.clearAllMocks();
  api.getMyAssistantThread.mockResolvedValue({ threadId: 'thread-1', aiConsent: true, turns: [] });
  api.saveMyAssistantConsent.mockResolvedValue({ accepted: true });
  api.sendMyAssistantTurn.mockResolvedValue({ turn: { id: 'turn-1', userMessage: 'Cách dùng nhật ký?', assistantMessage: 'Mở mục Nhật ký.', status: 'completed' } });
  api.getMyAppointmentMessages.mockResolvedValue({ appointmentId: 'appointment-1', items: [] });
  api.sendMyAppointmentMessage.mockResolvedValue({ message: { id: 'message-1', body: 'Xin chào', senderUserId: 'patient-1' } });
});

test('loads persisted assistant history and sends a consented turn to the account API', async () => {
  api.getMyAssistantThread.mockResolvedValue({ threadId: 'thread-1', aiConsent: true, turns: [{ id: 'turn-old', userMessage: 'Chào', assistantMessage: 'Xin chào.' }] });
  const screen = render(<ChatScreen account={{ id: 'patient-1' }} />);
  await waitFor(() => expect(screen.getByText('Xin chào.')).toBeTruthy());
  fireEvent.changeText(screen.getByLabelText('Tin nhắn'), 'Cách dùng nhật ký?');
  fireEvent.press(screen.getByLabelText('Gửi tin nhắn'));
  await waitFor(() => expect(screen.getByText('Mở mục Nhật ký.')).toBeTruthy());
  expect(api.sendMyAssistantTurn).toHaveBeenCalledWith(expect.objectContaining({ message: 'Cách dùng nhật ký?' }));
  expect(screen.queryByText(/phản hồi tự động|bản demo/i)).toBeNull();
});

test('requires explicit AI processing consent and records consent before enabling send', async () => {
  api.getMyAssistantThread.mockResolvedValue({ threadId: 'thread-1', aiConsent: false, turns: [] });
  const screen = render(<ChatScreen account={{ id: 'patient-1' }} />);
  await waitFor(() => expect(screen.getByText('Đồng ý và bật trợ lý AI')).toBeTruthy());
  expect(screen.getByLabelText('Tin nhắn').props.editable).toBe(false);
  expect(api.sendMyAssistantTurn).not.toHaveBeenCalled();
  fireEvent.press(screen.getByText('Đồng ý và bật trợ lý AI'));
  await waitFor(() => expect(api.saveMyAssistantConsent).toHaveBeenCalledWith({ version: 'ai-assistant-processing-v1', accepted: true }));
  await waitFor(() => expect(screen.getByLabelText('Tin nhắn').props.editable).toBe(true));
});

test('retries an assistant request with the same idempotency identifier and does not invent a reply', async () => {
  api.sendMyAssistantTurn.mockRejectedValueOnce(new Error('Kết nối bị gián đoạn.'))
    .mockResolvedValueOnce({ turn: { id: 'turn-2', userMessage: 'Xin chào', assistantMessage: 'Chào bạn.', status: 'completed' } });
  const screen = render(<ChatScreen account={{ id: 'patient-1' }} />);
  await waitFor(() => expect(screen.getByText('Lịch sử hội thoại của bạn sẽ hiển thị tại đây.')).toBeTruthy());
  fireEvent.changeText(screen.getByLabelText('Tin nhắn'), 'Xin chào');
  fireEvent.press(screen.getByLabelText('Gửi tin nhắn'));
  await waitFor(() => expect(screen.getByText('Thử gửi lại')).toBeTruthy());
  const firstId = api.sendMyAssistantTurn.mock.calls[0][0].clientMessageId;
  fireEvent.press(screen.getByText('Thử gửi lại'));
  await waitFor(() => expect(screen.getByText('Chào bạn.')).toBeTruthy());
  expect(api.sendMyAssistantTurn.mock.calls[1][0].clientMessageId).toBe(firstId);
});

test('loads appointment messages and sends only to the confirmed appointment conversation', async () => {
  const contact = { name: 'Bác sĩ dinh dưỡng', appointmentId: 'appointment-1' };
  const screen = render(<ChatScreen account={{ id: 'patient-1' }} contact={contact} />);
  await waitFor(() => expect(screen.getByText('Chưa có tin nhắn trong lịch hẹn này.')).toBeTruthy());
  fireEvent.changeText(screen.getByLabelText('Tin nhắn'), 'Xin chào');
  fireEvent.press(screen.getByLabelText('Gửi tin nhắn'));
  await waitFor(() => expect(api.sendMyAppointmentMessage).toHaveBeenCalledWith('appointment-1', expect.objectContaining({ body: 'Xin chào' })));
  expect(screen.getByText('Xin chào')).toBeTruthy();
  expect(screen.queryByText(/chưa gửi|mẫu|không có bác sĩ thật/i)).toBeNull();
  expect(api.sendMyAssistantTurn).not.toHaveBeenCalled();
});

test('uses the caller-provided back target when a conversation was opened from the inbox', async () => {
  const onBack = jest.fn();
  const onNavigate = jest.fn();
  const screen = render(<ChatScreen account={{ id: 'patient-1' }} onBack={onBack} onNavigate={onNavigate} />);
  await waitFor(() => expect(screen.getByText('Lịch sử hội thoại của bạn sẽ hiển thị tại đây.')).toBeTruthy());
  fireEvent.press(screen.getByLabelText('Quay lại'));
  expect(onBack).toHaveBeenCalledTimes(1);
  expect(onNavigate).not.toHaveBeenCalled();
});
