import React from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import MedicalRecordScreen from './MedicalRecordScreen';

jest.mock('expo-print', () => ({ printToFileAsync: jest.fn() }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));

beforeEach(() => {
  jest.clearAllMocks();
  Print.printToFileAsync.mockResolvedValue({ uri: 'file:///cache/medical-record.pdf' });
  Sharing.isAvailableAsync.mockResolvedValue(true);
  Sharing.shareAsync.mockResolvedValue(undefined);
});

test('exports the current demo record locally and opens the platform share sheet', async () => {
  const screen = render(<MedicalRecordScreen profile={{ age: 30, heightCm: 170, weightKg: 70, allergies: [], hardLimits: {} }} />);
  fireEvent.press(screen.getByRole('button', { name: 'Xuất PDF cục bộ' }));

  await waitFor(() => expect(screen.getByText('Đã tạo PDF cục bộ và mở bảng chia sẻ.')).toBeTruthy());
  expect(Print.printToFileAsync).toHaveBeenCalledWith(expect.objectContaining({ html: expect.stringContaining('70 kg') }));
  expect(Sharing.shareAsync).toHaveBeenCalledWith('file:///cache/medical-record.pdf', expect.objectContaining({ mimeType: 'application/pdf' }));
});

test('shows an actionable error when file sharing is unavailable and keeps retry available', async () => {
  Sharing.isAvailableAsync.mockResolvedValue(false);
  const screen = render(<MedicalRecordScreen profile={{ allergies: [], hardLimits: {} }} />);
  fireEvent.press(screen.getByRole('button', { name: 'Xuất PDF cục bộ' }));

  await waitFor(() => expect(screen.getByText('Chia sẻ tệp chưa khả dụng trên thiết bị này.')).toBeTruthy());
  expect(Print.printToFileAsync).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Xuất PDF cục bộ' })).toBeTruthy();
});

test('keeps record preview separate from creating or sharing a PDF', () => {
  const screen = render(<MedicalRecordScreen profile={{ age: 30, allergies: [], hardLimits: {} }} />);
  fireEvent.press(screen.getByRole('button', { name: 'Xem trước nội dung PDF' }));

  expect(screen.getByText('BẢN XEM TRƯỚC PDF · BẢN DEMO')).toBeTruthy();
  expect(Print.printToFileAsync).not.toHaveBeenCalled();
  expect(Sharing.shareAsync).not.toHaveBeenCalled();
});
