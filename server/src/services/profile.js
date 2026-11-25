const CONDITION_TYPES = new Set([
  'unspecified', 'heart-failure-stage-1-2', 'heart-failure-stage-3', 'heart-failure-stage-4',
  'acute-kidney-disease', 'chronic-kidney-disease-stage-1-2', 'chronic-kidney-disease-stage-3-4',
  'diabetes', 'hypertension', 'other',
]);
const RED_FLAGS = new Set(['chestPain', 'breathingDifficulty', 'fainting']);
const NUTRIENTS = new Set(['energyKcal', 'proteinG', 'carbohydrateG', 'fatG', 'fiberG', 'sodiumMg']);
const PROFILE_FIELDS = Object.freeze([
  'username', 'dateOfBirth', 'mode', 'gender', 'age', 'heightCm', 'weightKg', 'activityLevel', 'conditionType',
  'allergies', 'symptomNotes', 'redFlags', 'diagnosisNotes', 'hardLimits', 'medicalLimitsConfirmed',
]);
const PROFILE_NAME_PATTERN = /^[\p{L}0-9_.-]+(?: [\p{L}0-9_.-]+)*$/u;

function normalizeProfileName(value) {
  return String(value ?? '').normalize('NFC').trim().replace(/\s+/gu, ' ');
}

function isValidProfileName(value) {
  const name = normalizeProfileName(value);
  const length = Array.from(name).length;
  return length >= 3 && length <= 30 && PROFILE_NAME_PATTERN.test(name);
}

function invalidProfile(message = 'Dữ liệu hồ sơ không hợp lệ.') {
  const error = new Error(message);
  error.code = 'INVALID_PROFILE';
  return error;
}

function parseDateOfBirth(value) {
  if (value === null) return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw invalidProfile('Ngày sinh không hợp lệ.');
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) throw invalidProfile('Ngày sinh không hợp lệ.');
  const latestAllowed = new Date();
  latestAllowed.setUTCHours(0, 0, 0, 0);
  // Calendar dates from clients east of UTC can be one day ahead of the server's date.
  latestAllowed.setUTCDate(latestAllowed.getUTCDate() + 1);
  if (parsed > latestAllowed) throw invalidProfile('Ngày sinh không hợp lệ.');
  return value;
}

function parseProfileInput(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw invalidProfile();
  const unknown = Object.keys(input).filter(key => !PROFILE_FIELDS.includes(key));
  if (unknown.length) throw invalidProfile();
  const value = { ...input };
  if (typeof value.username !== 'string') throw invalidProfile('Tên hiển thị không hợp lệ.');
  value.username = normalizeProfileName(value.username);
  if (!isValidProfileName(value.username)) throw invalidProfile('Tên hiển thị không hợp lệ.');
  if (Object.prototype.hasOwnProperty.call(value, 'dateOfBirth')) value.dateOfBirth = parseDateOfBirth(value.dateOfBirth);
  if (!['healthy', 'patient'].includes(value.mode)) throw invalidProfile();
  if (!['female', 'male', 'unspecified'].includes(value.gender)) throw invalidProfile();
  if (!Number.isInteger(value.age) || value.age < 1 || value.age > 120) throw invalidProfile();
  if (!Number.isFinite(value.heightCm) || value.heightCm < 50 || value.heightCm > 260) throw invalidProfile();
  if (!Number.isFinite(value.weightKg) || value.weightKg < 2 || value.weightKg > 500) throw invalidProfile();
  if (!['low', 'moderate', 'high'].includes(value.activityLevel)) throw invalidProfile();
  if (!CONDITION_TYPES.has(value.conditionType)) throw invalidProfile();
  if (!Array.isArray(value.allergies) || value.allergies.length > 20 || value.allergies.some(item => typeof item !== 'string' || !item.trim() || item.trim().length > 80)) throw invalidProfile();
  if (new Set(value.allergies.map(item => item.trim().toLocaleLowerCase('vi'))).size !== value.allergies.length) throw invalidProfile();
  if (typeof value.symptomNotes !== 'string' || value.symptomNotes.length > 500) throw invalidProfile();
  if (typeof value.diagnosisNotes !== 'string' || value.diagnosisNotes.length > 500) throw invalidProfile();
  if (!Array.isArray(value.redFlags) || value.redFlags.length > RED_FLAGS.size || value.redFlags.some(flag => !RED_FLAGS.has(flag)) || new Set(value.redFlags).size !== value.redFlags.length) throw invalidProfile();
  if (!value.hardLimits || typeof value.hardLimits !== 'object' || Array.isArray(value.hardLimits)) throw invalidProfile();
  for (const [nutrient, range] of Object.entries(value.hardLimits)) {
    if (!NUTRIENTS.has(nutrient) || !range || typeof range !== 'object' || Array.isArray(range)) throw invalidProfile();
    const bounds = Object.keys(range);
    if (bounds.length < 1 || bounds.length > 2 || bounds.some(bound => !['min', 'max'].includes(bound))) throw invalidProfile();
    if (bounds.some(bound => !Number.isFinite(range[bound]) || range[bound] < 0)) throw invalidProfile();
    if (range.min !== undefined && range.max !== undefined && range.min > range.max) throw invalidProfile();
  }
  if (typeof value.medicalLimitsConfirmed !== 'boolean') throw invalidProfile();
  if (value.mode === 'patient' && (!value.medicalLimitsConfirmed || Object.keys(value.hardLimits).length === 0)) throw invalidProfile('Cần xác nhận đã đối chiếu giới hạn dinh dưỡng với bác sĩ.');
  if (value.mode === 'healthy' && (Object.keys(value.hardLimits).length > 0 || value.medicalLimitsConfirmed)) throw invalidProfile();
  return {
    username: value.username,
    ...(Object.prototype.hasOwnProperty.call(value, 'dateOfBirth') ? { date_of_birth: value.dateOfBirth } : {}),
    mode: value.mode,
    gender: value.gender,
    age: value.age,
    height_cm: value.heightCm,
    weight_kg: value.weightKg,
    activity_level: value.activityLevel,
    condition_type: value.conditionType,
    allergies: value.allergies.map(item => item.trim()),
    symptom_notes: value.symptomNotes,
    red_flags: value.redFlags,
    diagnosis_notes: value.diagnosisNotes,
    hard_limits: value.hardLimits,
    medical_limits_confirmed: value.medicalLimitsConfirmed,
  };
}

function toProfileDto(row) {
  if (!row) return null;
  return {
    username: row.username,
    dateOfBirth: row.date_of_birth || null,
    mode: row.mode,
    gender: row.gender,
    age: row.age,
    heightCm: Number(row.height_cm),
    weightKg: Number(row.weight_kg),
    activityLevel: row.activity_level,
    conditionType: row.condition_type,
    allergies: row.allergies || [],
    symptomNotes: row.symptom_notes || '',
    redFlags: row.red_flags || [],
    diagnosisNotes: row.diagnosis_notes || '',
    hardLimits: row.hard_limits || {},
    medicalLimitsConfirmed: row.medical_limits_confirmed === true,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

module.exports = { PROFILE_FIELDS, parseProfileInput, toProfileDto };
