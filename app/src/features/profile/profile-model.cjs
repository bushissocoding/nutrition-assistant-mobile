const NUTRIENTS = [
  { key: 'energyKcal', label: 'Năng lượng', unit: 'kcal' },
  { key: 'proteinG', label: 'Đạm (Protein)', unit: 'g' },
  { key: 'carbohydrateG', label: 'Tinh bột (Glucid)', unit: 'g' },
  { key: 'fatG', label: 'Chất béo (Lipid)', unit: 'g' },
  { key: 'fiberG', label: 'Chất xơ', unit: 'g' },
  { key: 'sodiumMg', label: 'Natri', unit: 'mg' },
];

const RED_FLAG_SYMPTOMS = [
  { key: 'chestPain', label: 'Đau/nghẹt ngực nghiêm trọng hoặc mới xuất hiện' },
  { key: 'breathingDifficulty', label: 'Khó thở nghiêm trọng' },
  { key: 'fainting', label: 'Ngất hoặc lú lẫn đột ngột' },
];

function createEmptyProfile() {
  return { version: 1, mode: 'healthy', age: '', heightCm: '', weightKg: '', activityLevel: 'moderate', symptomNotes: '', redFlags: [], allergies: [], diagnosisNotes: '', hardLimits: {}, medicalLimitsConfirmed: false };
}
function normalizeProfile(profile = {}) {
  const empty = createEmptyProfile();
  const input = profile && typeof profile === 'object' ? profile : {};
  return { ...empty, ...input, mode: input.mode === 'patient' ? 'patient' : 'healthy', redFlags: Array.isArray(input.redFlags) ? input.redFlags.filter(value => RED_FLAG_SYMPTOMS.some(item => item.key === value)) : [], allergies: Array.isArray(input.allergies) ? input.allergies.filter(value => typeof value === 'string').map(value => value.trim()).filter(Boolean) : [], hardLimits: input.hardLimits && typeof input.hardLimits === 'object' && !Array.isArray(input.hardLimits) ? input.hardLimits : {} };
}
function validateProfile(profile, limitInputs = {}) {
  const errors = {};
  if (!['healthy', 'patient'].includes(profile.mode)) errors.mode = 'Hãy chọn chế độ sử dụng.';
  if (String(profile.age).trim() === '' || !/^\d+$/.test(String(profile.age)) || Number(profile.age) < 1 || Number(profile.age) > 120) errors.age = 'Nhập tuổi từ 1 đến 120.';
  if (String(profile.heightCm).trim() === '' || !Number.isFinite(Number(profile.heightCm)) || Number(profile.heightCm) < 50 || Number(profile.heightCm) > 260) errors.heightCm = 'Nhập chiều cao từ 50 đến 260 cm.';
  if (String(profile.weightKg).trim() === '' || !Number.isFinite(Number(profile.weightKg)) || Number(profile.weightKg) < 2 || Number(profile.weightKg) > 500) errors.weightKg = 'Nhập cân nặng từ 2 đến 500 kg.';
  if (!['low', 'moderate', 'high'].includes(profile.activityLevel)) errors.activityLevel = 'Hãy chọn mức độ vận động.';
  if (profile.mode === 'healthy' && String(profile.symptomNotes || '').length > 500) errors.symptomNotes = 'Ghi chú tối đa 500 ký tự.';
  if (profile.mode === 'patient' && String(profile.diagnosisNotes || '').length > 500) errors.diagnosisNotes = 'Ghi chú tối đa 500 ký tự.';
  const allergies = Array.isArray(profile.allergies) ? profile.allergies : [];
  if (allergies.length > 20 || allergies.some(value => typeof value !== 'string' || value.length > 80)) {
    errors.allergies = 'Nhập tối đa 20 mục tránh ăn, mỗi mục không quá 80 ký tự.';
  }
  if (profile.mode === 'patient') {
    for (const nutrient of NUTRIENTS) {
      const min = String(limitInputs[`${nutrient.key}Min`] ?? '').trim();
      const max = String(limitInputs[`${nutrient.key}Max`] ?? '').trim();
      if (min && (!Number.isFinite(Number(min)) || Number(min) < 0)) errors[`${nutrient.key}Min`] = `Nhập giới hạn tối thiểu ${nutrient.label} hợp lệ hoặc để trống.`;
      if (max && (!Number.isFinite(Number(max)) || Number(max) < 0)) errors[`${nutrient.key}Max`] = `Nhập giới hạn tối đa ${nutrient.label} hợp lệ hoặc để trống.`;
      if (min && max && Number(min) > Number(max)) errors[`${nutrient.key}Max`] = `Giới hạn tối đa ${nutrient.label} phải lớn hơn hoặc bằng giới hạn tối thiểu.`;
    }
    const validLimits = Object.entries(profile.hardLimits || {}).filter(([key, range]) => NUTRIENTS.some(nutrient => nutrient.key === key) && range && ((Number.isFinite(range.min) && range.min >= 0) || (Number.isFinite(range.max) && range.max >= 0)) && (range.min === undefined || range.max === undefined || range.min <= range.max));
    if (Object.keys(profile.hardLimits || {}).length && validLimits.length !== Object.keys(profile.hardLimits).length) errors.medicalLimitsConfirmed = 'Các giới hạn chỉ tiêu không hợp lệ.';
    else if (!profile.medicalLimitsConfirmed || validLimits.length === 0) errors.medicalLimitsConfirmed = 'Cần nhập ít nhất một giới hạn dinh dưỡng theo chỉ định và xác nhận đã đối chiếu với bác sĩ.';
  }
  return errors;
}
function buildProfileDraft(profile, allergyText, limitInputs) {
  const hardLimits = {};
  for (const nutrient of NUTRIENTS) {
    const minText = String(limitInputs[`${nutrient.key}Min`] ?? '').trim();
    const maxText = String(limitInputs[`${nutrient.key}Max`] ?? '').trim();
    const range = {};
    if (minText && Number.isFinite(Number(minText)) && Number(minText) >= 0) range.min = Number(minText);
    if (maxText && Number.isFinite(Number(maxText)) && Number(maxText) >= 0) range.max = Number(maxText);
    if (Object.keys(range).length) hardLimits[nutrient.key] = range;
  }
  return normalizeProfile({ ...profile, allergies: allergyText.split(',').map(value => value.trim()).filter(Boolean), hardLimits: profile.mode === 'patient' ? hardLimits : {} });
}
function hasUrgentRedFlags(profile) {
  return profile?.mode === 'healthy' && Array.isArray(profile.redFlags) && profile.redFlags.length > 0;
}
function calculateAdultBmi(profile) {
  const age = Number(profile.age);
  const height = Number(profile.heightCm) / 100;
  const weight = Number(profile.weightKg);
  if (age < 18 || !Number.isFinite(age) || !Number.isFinite(height) || !Number.isFinite(weight) || height <= 0 || weight <= 0) return null;
  return Math.round((weight / (height * height)) * 10) / 10;
}
module.exports = { NUTRIENTS, RED_FLAG_SYMPTOMS, createEmptyProfile, normalizeProfile, validateProfile, buildProfileDraft, hasUrgentRedFlags, calculateAdultBmi };
