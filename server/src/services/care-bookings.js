const { createHash } = require('node:crypto');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PROVIDER_FIELDS = ['displayName', 'specialty', 'bio', 'experienceYears', 'feeVnd'];
const CREDENTIAL_FIELDS = ['licenseNumber', 'region'];
const BOOKING_FIELDS = ['providerId', 'slotId', 'patientName', 'phone', 'symptomNote', 'providerSharingAccepted'];
const CANCEL_FIELDS = ['reason', 'note'];
const CANCEL_REASONS = new Set(['schedule-change', 'illness', 'other']);
const HALF_HOUR_MS = 30 * 60 * 1000;
const MAX_AVAILABILITY_MS = 90 * 24 * 60 * 60 * 1000;

class CareBookingValidationError extends Error {
  constructor(message, code = 'VALIDATION_ERROR', status = 400) {
    super(message);
    this.name = 'CareBookingValidationError';
    this.code = code;
    this.status = status;
  }
}

function assertExactRecord(input, fields, message) {
  if (!input || typeof input !== 'object' || Array.isArray(input)
    || Object.keys(input).length !== fields.length || Object.keys(input).some(key => !fields.includes(key))) {
    throw new CareBookingValidationError(message);
  }
}

function text(input, key, { min = 0, max, label }) {
  if (typeof input[key] !== 'string') throw new CareBookingValidationError(`${label} không hợp lệ.`);
  const value = input[key].trim().replace(/\s+/g, ' ');
  if (value.length < min || value.length > max) throw new CareBookingValidationError(`${label} phải dài từ ${min} đến ${max} ký tự.`);
  return value;
}

function normalizeProviderProfile(input) {
  assertExactRecord(input, PROVIDER_FIELDS, 'Thông tin hồ sơ nhà cung cấp không hợp lệ.');
  const displayName = text(input, 'displayName', { min: 2, max: 100, label: 'Tên hiển thị' });
  const specialty = text(input, 'specialty', { min: 2, max: 100, label: 'Chuyên khoa' });
  const bio = text(input, 'bio', { max: 2000, label: 'Giới thiệu' });
  if (!Number.isSafeInteger(input.experienceYears) || input.experienceYears < 0 || input.experienceYears > 60) throw new CareBookingValidationError('Số năm kinh nghiệm phải từ 0 đến 60.');
  if (!Number.isSafeInteger(input.feeVnd) || input.feeVnd < 0 || input.feeVnd > 50_000_000) throw new CareBookingValidationError('Phí dịch vụ phải từ 0 đến 50.000.000 VND.');
  return { displayName, specialty, bio, experienceYears: input.experienceYears, feeVnd: input.feeVnd };
}

function normalizeProviderCredentials(input) {
  assertExactRecord(input, CREDENTIAL_FIELDS, 'Thông tin xác minh nhà cung cấp không hợp lệ.');
  return {
    licenseNumber: text(input, 'licenseNumber', { min: 3, max: 100, label: 'Số giấy phép' }),
    region: text(input, 'region', { min: 2, max: 100, label: 'Nơi cấp' }),
  };
}

function normalizeAvailabilitySlot(input, { now = new Date() } = {}) {
  assertExactRecord(input, ['startsAt', 'endsAt'], 'Khung giờ không hợp lệ.');
  const timestamp = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && new Date(value).toISOString() === value
    ? new Date(value).getTime() : NaN;
  const startsAt = timestamp(input.startsAt);
  const endsAt = timestamp(input.endsAt);
  const nowMs = new Date(now).getTime();
  if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt) || !Number.isFinite(nowMs)
    || startsAt % HALF_HOUR_MS !== 0 || endsAt - startsAt !== HALF_HOUR_MS
    || startsAt <= nowMs || startsAt > nowMs + MAX_AVAILABILITY_MS) {
    throw new CareBookingValidationError('Chỉ nhận khung 30 phút UTC bắt đầu trong 90 ngày tới.');
  }
  return { startsAt: new Date(startsAt).toISOString(), endsAt: new Date(endsAt).toISOString() };
}

function normalizeBookingInput(input) {
  assertExactRecord(input, BOOKING_FIELDS, 'Thông tin đặt lịch không hợp lệ.');
  if (typeof input.providerId !== 'string' || !UUID.test(input.providerId)
    || typeof input.slotId !== 'string' || !UUID.test(input.slotId)) throw new CareBookingValidationError('Bác sĩ hoặc khung giờ không hợp lệ.');
  const patientName = text(input, 'patientName', { min: 2, max: 100, label: 'Tên người khám' });
  if (typeof input.phone !== 'string' || !/^\+[1-9]\d{7,14}$/.test(input.phone.trim())) throw new CareBookingValidationError('Số điện thoại cần có mã quốc gia, ví dụ +84901234567.');
  const symptomNote = text(input, 'symptomNote', { max: 1000, label: 'Triệu chứng sơ bộ' });
  if (input.providerSharingAccepted !== true) throw new CareBookingValidationError('Cần đồng ý chia sẻ thông tin đặt lịch với nhà cung cấp đã chọn.');
  return { providerId: input.providerId.toLowerCase(), slotId: input.slotId.toLowerCase(), patientName, phone: input.phone.trim(), symptomNote, providerSharingAccepted: true };
}

function appointmentRequestHash(input) {
  return createHash('sha256').update(JSON.stringify(normalizeBookingInput(input))).digest('hex');
}

function normalizeCancelInput(input) {
  assertExactRecord(input, CANCEL_FIELDS, 'Thông tin hủy lịch không hợp lệ.');
  if (typeof input.reason !== 'string' || !CANCEL_REASONS.has(input.reason)) throw new CareBookingValidationError('Lý do hủy lịch không hợp lệ.');
  return { reason: input.reason, note: text(input, 'note', { max: 500, label: 'Ghi chú hủy lịch' }) };
}

function canTransitionAppointment(from, to, actor) {
  if (from === 'awaiting_payment' && ['patient', 'provider'].includes(actor) && to === 'cancelled') return true;
  if (from === 'awaiting_payment' && actor === 'system' && to === 'expired') return true;
  if (from === 'confirmed' && actor === 'patient' && to === 'cancelled') return true;
  if (from === 'confirmed' && actor === 'provider' && ['completed', 'cancelled'].includes(to)) return true;
  return false;
}

module.exports = {
  BOOKING_FIELDS,
  CANCEL_REASONS,
  CareBookingValidationError,
  UUID,
  appointmentRequestHash,
  canTransitionAppointment,
  normalizeAvailabilitySlot,
  normalizeBookingInput,
  normalizeCancelInput,
  normalizeProviderCredentials,
  normalizeProviderProfile,
};
