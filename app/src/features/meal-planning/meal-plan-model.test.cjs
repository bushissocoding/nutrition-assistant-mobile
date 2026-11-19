const test = require('node:test');
const assert = require('node:assert/strict');
const { CONTRACT_VERSION, buildPlannerPayload, validatePlannerRequest } = require('./meal-plan-model.cjs');

test('planner request validates integer VND boundary and hard medical limits consent', () => {
  assert.equal(validatePlannerRequest({ profile: { mode: 'healthy', redFlags: [] }, budget: '0' }), '');
  assert.match(validatePlannerRequest({ profile: { mode: 'healthy', redFlags: [] }, budget: '10000001' }), /ngân sách/);
  assert.match(validatePlannerRequest({ profile: { mode: 'healthy', redFlags: [] }, budget: '10.5' }), /ngân sách/);
  assert.match(validatePlannerRequest({ profile: { mode: 'healthy', redFlags: ['fainting'] }, budget: '1000' }), /nhân viên y tế/);
  assert.match(validatePlannerRequest({ profile: { mode: 'patient', medicalLimitsConfirmed: false, hardLimits: { sodiumMg: { max: 2000 } } }, budget: '1000' }), /đối chiếu với bác sĩ/);
});

test('planner payload preserves allergy and only sends patient hard limits', () => {
  const patient = buildPlannerPayload({ profile: { mode: 'patient', allergies: ['cá'], hardLimits: { sodiumMg: { max: 2000 } } }, budget: '120000', preferences: 'gà' });
  assert.equal(patient.contractVersion, CONTRACT_VERSION);
  assert.equal(patient.budgetVnd, 120000);
  assert.deepEqual(patient.allergies, ['cá']);
  assert.deepEqual(patient.hardLimits, { sodiumMg: { max: 2000 } });
  const healthy = buildPlannerPayload({ profile: { mode: 'healthy', allergies: ['trứng'], hardLimits: { sodiumMg: { max: 1 } } }, budget: '10', preferences: '' });
  assert.deepEqual(healthy.hardLimits, {});
  assert.deepEqual(healthy.allergies, ['trứng']);
});
