const assert = require('node:assert/strict');
const test = require('node:test');
const { MAX_RECORD_SOURCE_BYTES, parseLabCandidates, validateHealthRecordCandidates } = require('./health-record-ocr.cjs');

test('parses English and Vietnamese lab candidates without interpreting or validating clinical meaning', () => {
  const candidates = parseLabCandidates('Glucose: 5,4 mmol/L (3.9–5.5)\nĐường huyết 95 mg/dL\nNgày xét nghiệm: 2026\nHemoglobin 13.2 g/dL');
  assert.deepEqual(candidates.map(({ name, value, unit, referenceRange, confirmed }) => ({ name, value, unit, referenceRange, confirmed })), [
    { name: 'Glucose', value: '5.4', unit: 'mmol/L', referenceRange: '3.9–5.5', confirmed: false },
    { name: 'Đường huyết', value: '95', unit: 'mg/dL', referenceRange: '', confirmed: false },
    { name: 'Hemoglobin', value: '13.2', unit: 'g/dL', referenceRange: '', confirmed: false },
  ]);
});

test('bounds untrusted OCR input and requires user confirmation for persistence', () => {
  assert.deepEqual(parseLabCandidates('x'.repeat(100_001)), []);
  const [candidate] = parseLabCandidates('Glucose: 5.4 mmol/L');
  assert.equal(validateHealthRecordCandidates([candidate]), false);
  assert.equal(validateHealthRecordCandidates([{ ...candidate, confirmed: true }]), true);
  assert.equal(validateHealthRecordCandidates([{ ...candidate, name: '', confirmed: true }]), false);
  assert.equal(MAX_RECORD_SOURCE_BYTES, 8 * 1024 * 1024);
});
