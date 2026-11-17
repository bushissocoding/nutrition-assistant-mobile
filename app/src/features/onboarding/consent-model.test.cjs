const test = require('node:test');
const assert = require('node:assert/strict');
const {
  CONSENT_CHOICES,
  CONSENT_VERSION,
  createConsentRecord,
  isCurrentConsentRecord,
  validateConsentChoices,
} = require('./consent-model.cjs');

const acceptedChoices = Object.fromEntries(CONSENT_CHOICES.map(({ key }) => [key, true]));

test('requires every consent choice before onboarding can continue', () => {
  assert.equal(Object.keys(validateConsentChoices(acceptedChoices)).length, 0);
  assert.ok(validateConsentChoices({ ...acceptedChoices, [CONSENT_CHOICES[0].key]: false })[CONSENT_CHOICES[0].key]);
  assert.equal(Object.keys(validateConsentChoices({})).length, CONSENT_CHOICES.length);
});

test('creates a versioned receipt with the chosen options and an ISO timestamp', () => {
  const record = createConsentRecord(acceptedChoices, new Date('2026-11-17T01:02:03.000Z'));

  assert.deepEqual(record, {
    version: CONSENT_VERSION,
    acceptedAt: '2026-11-17T01:02:03.000Z',
    choices: acceptedChoices,
  });
  assert.equal(isCurrentConsentRecord(record), true);
});

test('rejects malformed, incomplete, and outdated consent receipts', () => {
  const valid = createConsentRecord(acceptedChoices, new Date('2026-11-17T01:02:03.000Z'));

  assert.throws(() => createConsentRecord({ ...acceptedChoices, [CONSENT_CHOICES[0].key]: false }));
  assert.equal(isCurrentConsentRecord({ ...valid, version: 'old-version' }), false);
  assert.equal(isCurrentConsentRecord({ ...valid, acceptedAt: 'not-a-date' }), false);
  assert.equal(isCurrentConsentRecord({ ...valid, choices: {} }), false);
});
