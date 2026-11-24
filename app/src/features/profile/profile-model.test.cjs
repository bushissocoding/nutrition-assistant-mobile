const test = require('node:test');
const assert = require('node:assert/strict');
const { buildProfileDraft, calculateAdultBmi, createEmptyProfile, hasUrgentRedFlags, isValidProfileName, normalizeProfile, normalizeProfileName, validateProfile } = require('./profile-model.cjs');

test('healthy profile calculates BMI for adult and does not diagnose', () => {
  assert.equal(calculateAdultBmi({ age: '25', heightCm: '170', weightKg: '62' }), 21.5);
  assert.equal(calculateAdultBmi({ age: '16', heightCm: '170', weightKg: '62' }), null);
});

test('healthy profile requires core measurements and red flags are safety gate', () => {
  const profile = { ...createEmptyProfile(), mode: 'healthy', age: '25', heightCm: '170', weightKg: '62', redFlags: ['chestPain'] };
  assert.equal(hasUrgentRedFlags(profile), true);
  assert.equal(validateProfile({ ...profile, redFlags: [] }).age, undefined);
  assert.ok(validateProfile({ ...profile, age: '', redFlags: [] }).age);
});

test('patient profile validates entered clinical ranges and confirmation', () => {
  const base = { ...createEmptyProfile(), mode: 'patient', age: '50', heightCm: '160', weightKg: '63' };
  const draft = buildProfileDraft(base, 'tôm, cá', { sodiumMgMin: '0', sodiumMgMax: '2000' });
  assert.equal(draft.allergies.join(','), 'tôm,cá');
  assert.deepEqual(draft.hardLimits.sodiumMg, { min: 0, max: 2000 });
  assert.ok(validateProfile({ ...draft, medicalLimitsConfirmed: false }).medicalLimitsConfirmed);
  assert.equal(validateProfile({ ...draft, medicalLimitsConfirmed: true }).medicalLimitsConfirmed, undefined);
  assert.ok(validateProfile(draft, { sodiumMgMin: '3000', sodiumMgMax: '1000' }).sodiumMgMax);
});

test('profile normalizer removes unsupported red-flag and malformed allergy values', () => {
  const result = normalizeProfile({ mode: 'healthy', redFlags: ['chestPain', 'unknown'], allergies: ['  cá ', null, ''] });
  assert.deepEqual(result.redFlags, ['chestPain']);
  assert.deepEqual(result.allergies, ['cá']);
});

test('normalizes the optional gender selection from the assessment flow', () => {
  assert.equal(normalizeProfile({ gender: 'female' }).gender, 'female');
  assert.equal(normalizeProfile({ gender: 'unsupported' }).gender, 'unspecified');
});

test('keeps one supported health-condition selection as profile metadata', () => {
  assert.equal(createEmptyProfile().conditionType, 'unspecified');
  assert.equal(normalizeProfile({ conditionType: 'acute-kidney-disease' }).conditionType, 'acute-kidney-disease');
  assert.equal(normalizeProfile({ conditionType: 'unknown-disease' }).conditionType, 'unspecified');
});

test('validates activity values and bounds profile notes and allergy entries', () => {
  const valid = { ...createEmptyProfile(), age: '30', heightCm: '170', weightKg: '65', allergies: ['cá'] };
  const errors = validateProfile({
    ...valid,
    activityLevel: 'extreme',
    symptomNotes: 'x'.repeat(501),
    allergies: ['x'.repeat(81)],
  });

  assert.ok(errors.activityLevel);
  assert.ok(errors.symptomNotes);
  assert.ok(errors.allergies);
  assert.equal(validateProfile({ ...valid, activityLevel: 'moderate' }).activityLevel, undefined);
});

test('normalizes and validates Unicode profile display names with spaces', () => {
  assert.equal(normalizeProfileName('  Nguy\u0065\u0302\u0303n   Va\u0306n An  '), 'Nguyễn Văn An');
  assert.equal(isValidProfileName('  Nguyễn   Văn An  '), true);
  assert.equal(isValidProfileName('A'), false);
  assert.equal(isValidProfileName('Gia @ Khang'), false);
});
