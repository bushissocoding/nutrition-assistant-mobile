import React, { useState } from 'react';
import { fireEvent, render, waitFor } from '@testing-library/react-native';
import PersonalizationScreen from './PersonalizationScreen';
import { api } from '../../services/api';
import * as ImagePicker from 'expo-image-picker';
import { recognizeLabImage } from '../../services/health-record-ocr';

jest.mock('../../services/api', () => ({ api: { getMyPersonalization: jest.fn(), saveMyPersonalization: jest.fn(), saveMyHealthRecord: jest.fn(), uploadMyHealthRecordSource: jest.fn() } }));
jest.mock('expo-image-picker', () => ({
  requestCameraPermissionsAsync: jest.fn(), launchCameraAsync: jest.fn(), launchImageLibraryAsync: jest.fn(),
  UIImagePickerPreferredAssetRepresentationMode: { Compatible: 'compatible' },
}));
jest.mock('../../services/health-record-ocr', () => ({ recognizeLabImage: jest.fn() }));

const profile = { username: 'patient', mode: 'healthy', age: 30, heightCm: 170, weightKg: 70, gender: 'unspecified', activityLevel: 'moderate', conditionType: 'unspecified', allergies: [], hardLimits: {} };

beforeEach(() => {
  jest.clearAllMocks();
  api.getMyPersonalization.mockResolvedValue({ preferences: { dietaryVariety: 'balanced', foodPreferences: ['Vietnamese'], allergyReminder: true, trackConfirmedTargets: false, updatedAt: '2026-11-24T00:00:00.000Z' } });
  api.saveMyPersonalization.mockImplementation(async preferences => ({ preferences: { ...preferences, updatedAt: '2026-11-25T00:00:00.000Z' } }));
  ImagePicker.launchImageLibraryAsync.mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///lab.jpg', fileName: 'panel.jpg', fileSize: 1024, mimeType: 'image/jpeg' }] });
  ImagePicker.requestCameraPermissionsAsync.mockResolvedValue({ granted: true });
  ImagePicker.launchCameraAsync.mockResolvedValue({ canceled: true, assets: [] });
  recognizeLabImage.mockResolvedValue({ candidates: [{ id: 'ocr-1', name: 'Glucose', value: '5.4', unit: 'mmol/L', referenceRange: '3.9–5.5', confirmed: false }] });
  api.saveMyHealthRecord.mockResolvedValue({ record: { id: 'record-1' } });
  api.uploadMyHealthRecordSource.mockResolvedValue({ record: { id: 'record-1', source: { available: true } } });
  global.fetch = jest.fn().mockResolvedValue({ async blob() { return new Blob(['jpeg'], { type: 'image/jpeg' }); } });
});

test('loads and saves account personalization without sending server timestamps', async () => {
  const screen = render(<PersonalizationScreen profile={profile} onEditProfile={jest.fn()} />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Cân bằng' }).props.accessibilityState.selected).toBe(true));
  fireEvent.press(screen.getByRole('button', { name: 'Đa dạng' }));
  fireEvent.press(screen.getByRole('button', { name: 'Ăn chay' }));
  fireEvent.press(screen.getByRole('switch', { name: 'Nhắc kiểm tra thành phần gây dị ứng' }));
  fireEvent.press(screen.getByRole('button', { name: 'Lưu lựa chọn' }));

  await waitFor(() => expect(api.saveMyPersonalization).toHaveBeenCalledWith({ dietaryVariety: 'varied', foodPreferences: ['Vietnamese', 'vegetarian'], allergyReminder: false, trackConfirmedTargets: false }));
  expect(screen.getByText('Lựa chọn cá nhân hóa đã được lưu vào tài khoản.')).toBeTruthy();
  expect(api.getMyPersonalization).toHaveBeenCalledTimes(1);
});

test('keeps edits visible and offers a retry after an account preference save failure', async () => {
  api.saveMyPersonalization.mockRejectedValueOnce(new Error('API tạm thời không sẵn sàng.'));
  const screen = render(<PersonalizationScreen profile={profile} />);
  await waitFor(() => expect(screen.getByRole('button', { name: 'Cân bằng' }).props.accessibilityState.selected).toBe(true));
  fireEvent.press(screen.getByRole('button', { name: 'Đơn giản' }));
  fireEvent.press(screen.getByRole('button', { name: 'Lưu lựa chọn' }));

  expect(await screen.findByText('API tạm thời không sẵn sàng.')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Đơn giản' }).props.accessibilityState.selected).toBe(true);
  fireEvent.press(screen.getByRole('button', { name: 'Lưu lựa chọn' }));
  await waitFor(() => expect(api.saveMyPersonalization).toHaveBeenCalledTimes(2));
  expect(screen.getByText('Lựa chọn cá nhân hóa đã được lưu vào tài khoản.')).toBeTruthy();
});

function ConsentWrapper() {
  const [enabled, setEnabled] = useState(false);
  return <PersonalizationScreen profile={profile} healthRecordConsent={enabled} onEnableHealthRecordStorage={async () => setEnabled(true)} onOpenMedicalRecord={jest.fn()} onEditProfile={jest.fn()} />;
}

test('shows account health profile and opens the real scan consent flow', () => {
  const onEditProfile = jest.fn();
  const screen = render(<PersonalizationScreen profile={profile} onEditProfile={onEditProfile} />);
  expect(screen.getByText('170 cm')).toBeTruthy();
  expect(screen.getByText('70 kg')).toBeTruthy();
  fireEvent.press(screen.getByText('Chỉnh sửa hồ sơ sức khỏe'));
  expect(onEditProfile).toHaveBeenCalledTimes(1);
  fireEvent.press(screen.getByText('Thêm kết quả xét nghiệm'));
  expect(screen.getByText(/Ảnh và hồ sơ sức khỏe là dữ liệu nhạy cảm/)).toBeTruthy();
  expect(screen.getByText('Đồng ý lưu hồ sơ xét nghiệm')).toBeTruthy();
  expect(screen.queryByLabelText('Chọn ảnh kết quả xét nghiệm')).toBeNull();
});

test('requires a user review and confirmation before saving device OCR values and image', async () => {
  const screen = render(<ConsentWrapper />);
  fireEvent.press(screen.getByText('Thêm kết quả xét nghiệm'));
  fireEvent.press(screen.getByText('Đồng ý lưu hồ sơ xét nghiệm'));
  await waitFor(() => expect(screen.getByLabelText('Chọn ảnh kết quả xét nghiệm')).toBeTruthy());
  fireEvent.press(screen.getByLabelText('Chọn ảnh kết quả xét nghiệm'));
  await waitFor(() => expect(screen.getByLabelText('Giá trị chỉ số 1')).toBeTruthy());
  expect(recognizeLabImage).toHaveBeenCalledWith('file:///lab.jpg');
  expect(api.saveMyHealthRecord).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Giá trị chỉ số 1').props.value).toBe('5.4');
  fireEvent.changeText(screen.getByLabelText('Giá trị chỉ số 1'), '5.6');
  fireEvent.press(screen.getByLabelText('Xác nhận chỉ số 1'));
  fireEvent.press(screen.getByText('Xác nhận và lưu hồ sơ'));
  await waitFor(() => expect(api.uploadMyHealthRecordSource).toHaveBeenCalledWith('record-1', expect.any(Blob), 'image/jpeg'));
  expect(api.saveMyHealthRecord).toHaveBeenCalledWith(expect.objectContaining({
    results: [{ name: 'Glucose', value: '5.6', unit: 'mmol/L', referenceRange: '3.9–5.5', confirmed: true }],
  }), null, expect.any(String));
  expect(screen.getByText('Hồ sơ đã được lưu vào tài khoản')).toBeTruthy();
});

test('keeps the selected image and allows OCR retry when on-device recognition is unavailable', async () => {
  recognizeLabImage.mockRejectedValueOnce(new Error('Thiết bị hiện không hỗ trợ OCR ngoại tuyến.'));
  const screen = render(<ConsentWrapper />);
  fireEvent.press(screen.getByText('Thêm kết quả xét nghiệm'));
  fireEvent.press(screen.getByText('Đồng ý lưu hồ sơ xét nghiệm'));
  await waitFor(() => expect(screen.getByLabelText('Chọn ảnh kết quả xét nghiệm')).toBeTruthy());
  fireEvent.press(screen.getByLabelText('Chọn ảnh kết quả xét nghiệm'));
  await waitFor(() => expect(screen.getByText('Thiết bị hiện không hỗ trợ OCR ngoại tuyến.')).toBeTruthy());
  expect(screen.getByLabelText('Ảnh xét nghiệm đang được rà soát trên thiết bị')).toBeTruthy();
  expect(screen.getByText('Thử nhận diện lại')).toBeTruthy();
  expect(api.saveMyHealthRecord).not.toHaveBeenCalled();
});
