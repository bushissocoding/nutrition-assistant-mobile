import React from 'react';
import { act, fireEvent, render, waitFor } from '@testing-library/react-native';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import MedicalRecordScreen from './MedicalRecordScreen';
import { api } from '../../services/api';
import { Alert } from 'react-native';

jest.mock('expo-print', () => ({ printToFileAsync: jest.fn() }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(), shareAsync: jest.fn() }));
jest.mock('../../services/api', () => ({ api: { getMyHealthRecords: jest.fn(), getMyHealthRecordSource: jest.fn(), deleteMyHealthRecord: jest.fn() } }));

beforeEach(() => {
  jest.clearAllMocks();
  Print.printToFileAsync.mockResolvedValue({ uri: 'file:///cache/medical-record.pdf' });
  Sharing.isAvailableAsync.mockResolvedValue(true);
  Sharing.shareAsync.mockResolvedValue(undefined);
  api.getMyHealthRecords.mockResolvedValue({ items: [], total: 0 });
  api.getMyHealthRecordSource.mockResolvedValue({ source: { url: 'https://storage.example/signed', mimeType: 'image/jpeg' } });
  api.deleteMyHealthRecord.mockResolvedValue(null);
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

  expect(screen.getByText('BẢN XEM TRƯỚC PDF')).toBeTruthy();
  expect(Print.printToFileAsync).not.toHaveBeenCalled();
  expect(Sharing.shareAsync).not.toHaveBeenCalled();
});

test('loads account-owned lab results, offers a short-lived private source preview and deletes the record', async () => {
  api.getMyHealthRecords.mockResolvedValue({ items: [{ id: 'record-1', title: 'Blood panel', sourceDate: '2026-11-24', source: { available: true }, results: [{ id: 'result-1', name: 'Glucose', value: '5.4', unit: 'mmol/L', referenceRange: '3.9–5.5' }] }] });
  const screen = render(<MedicalRecordScreen account={{ id: 'patient-1', email: 'patient@example.test' }} profile={{ age: 30, heightCm: 170, weightKg: 70, allergies: [], hardLimits: {} }} />);
  await waitFor(() => expect(screen.getByText('Blood panel')).toBeTruthy());
  expect(screen.getAllByText(/Glucose/).length).toBeGreaterThan(0);
  fireEvent.press(screen.getByLabelText('Xem ảnh nguồn Blood panel'));
  await waitFor(() => expect(screen.getByLabelText('Ảnh nguồn Blood panel')).toBeTruthy());
  expect(api.getMyHealthRecordSource).toHaveBeenCalledWith('record-1');
  let confirmationButtons;
  const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation((_title, _message, buttons) => { confirmationButtons = buttons; });
  fireEvent.press(screen.getByLabelText('Xóa hồ sơ Blood panel'));
  await act(async () => { await confirmationButtons.find(button => button.style === 'destructive').onPress(); });
  await waitFor(() => expect(api.deleteMyHealthRecord).toHaveBeenCalledWith('record-1'));
  expect(screen.queryByText('Blood panel')).toBeNull();
  alertSpy.mockRestore();
});

test('exports account result values into the local PDF preview with a non-clinical note', async () => {
  api.getMyHealthRecords.mockResolvedValue({ items: [{ id: 'record-2', title: 'Panel', sourceDate: '2026-11-24', results: [{ id: 'result-2', name: '<Glucose>', value: '5.4', unit: 'mmol/L', referenceRange: '' }] }] });
  const screen = render(<MedicalRecordScreen account={{ id: 'patient-1' }} profile={{ age: 30, allergies: [], hardLimits: {} }} />);
  await waitFor(() => expect(screen.getByText('Panel')).toBeTruthy());
  fireEvent.press(screen.getByText('Xem trước nội dung PDF'));
  expect(screen.getAllByText(/<Glucose>: 5.4 mmol\/L/).length).toBeGreaterThan(0);
  expect(screen.getAllByText(/chưa được kiểm tra y tế/).length).toBeGreaterThan(0);
  expect(Print.printToFileAsync).not.toHaveBeenCalled();
});

test('loads all pages of account lab records before showing and exporting them', async () => {
  const firstPage = Array.from({ length: 100 }, (_, index) => ({
    id: `record-${index + 1}`,
    title: `Synthetic panel ${index + 1}`,
    sourceDate: '2026-11-01',
    results: [],
  }));
  const lastRecord = {
    id: 'record-101',
    title: 'Synthetic panel 101',
    sourceDate: '2026-11-02',
    results: [{ id: 'result-101', name: 'Result 101', value: '5.2', unit: 'mg/L', referenceRange: '' }],
  };
  api.getMyHealthRecords.mockImplementation(async ({ limit, offset }) => ({
    items: offset === 0 ? firstPage : [lastRecord],
    total: 101,
    limit,
    offset,
  }));

  const screen = render(<MedicalRecordScreen account={{ id: 'patient-1' }} profile={{ age: 30, allergies: [], hardLimits: {} }} />);

  await waitFor(() => expect(api.getMyHealthRecords).toHaveBeenCalledWith({ limit: 100, offset: 100 }));
  expect(screen.getByText('Synthetic panel 101')).toBeTruthy();

  fireEvent.press(screen.getByRole('button', { name: 'Xem trước nội dung PDF' }));
  expect(screen.getAllByText(/Result 101: 5.2 mg\/L/).length).toBeGreaterThan(0);

  fireEvent.press(screen.getByRole('button', { name: 'Xuất PDF cục bộ' }));
  await waitFor(() => expect(screen.getByText('Đã tạo PDF cục bộ và mở bảng chia sẻ.')).toBeTruthy());
  expect(Print.printToFileAsync).toHaveBeenCalledWith(expect.objectContaining({
    html: expect.stringContaining('Result 101: 5.2 mg/L'),
  }));
});

test('does not show or export a partial record list when a later page fails', async () => {
  api.getMyHealthRecords
    .mockResolvedValueOnce({ items: [{ id: 'partial-record', title: 'Partial synthetic panel', results: [] }], total: 101 })
    .mockRejectedValueOnce(new Error('Không thể tải trang hồ sơ tiếp theo.'));
  const screen = render(<MedicalRecordScreen account={{ id: 'patient-1' }} profile={{ age: 30, allergies: [], hardLimits: {} }} />);

  await waitFor(() => expect(screen.getByText('Không thể tải trang hồ sơ tiếp theo.')).toBeTruthy());
  expect(screen.queryByText('Partial synthetic panel')).toBeNull();
  expect(screen.getByRole('button', { name: 'Xuất PDF cục bộ' }).props.accessibilityState.disabled).toBe(true);
  expect(screen.getByRole('button', { name: 'Xem trước nội dung PDF' }).props.accessibilityState.disabled).toBe(true);
  expect(Print.printToFileAsync).not.toHaveBeenCalled();
});
